/**
 * Pluggy Open Finance Sync
 * Roda via GitHub Actions a cada 6h
 * Autentica na Pluggy, puxa saldos/limites/faturas e atualiza o Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PLUGGY_API = 'https://api.pluggy.ai';
const PLUGGY_CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const PLUGGY_CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;

const BANK_ICONS = {
  'Nubank':'💜','Inter':'🟠','C6 Bank':'⚫','PicPay':'🟢',
  'Mercado Pago':'🔵','Itaú':'🟠','Bradesco':'🔴','Banco do Brasil':'🟡',
  'Caixa':'🔵','Santander':'🔴','Sicoob':'🟢','Sicredi':'🟢',
  'Neon':'🔵','PagBank':'🟡','Will Bank':'🟣','Next':'🟢','BTG Pactual':'⚫'
};

const BANK_COLORS = {
  'Nubank':'#9b72ef','Inter':'#ff6b35','C6 Bank':'#1a1a1a','PicPay':'#00c853',
  'Mercado Pago':'#2196f3','Itaú':'#ff6b35','Bradesco':'#e53935',
  'Banco do Brasil':'#ffd600','Caixa':'#2196f3','Santander':'#e53935',
  'Sicoob':'#00c853','Sicredi':'#00c853','Neon':'#2196f3','PagBank':'#ffd600',
  'Will Bank':'#9b72ef','Next':'#00c853','BTG Pactual':'#1a1a1a'
};

// ── Firebase init ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Pluggy Auth ──
async function pluggyAuth() {
  const resp = await fetch(`${PLUGGY_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET })
  });
  if (!resp.ok) throw new Error(`Pluggy auth failed: ${resp.status}`);
  const data = await resp.json();
  return data.apiKey;
}

// ── Fetch accounts for a Pluggy item ──
async function fetchAccounts(apiKey, itemId) {
  const resp = await fetch(`${PLUGGY_API}/accounts?itemId=${itemId}`, {
    headers: { 'X-API-KEY': apiKey }
  });
  if (!resp.ok) throw new Error(`Fetch accounts failed: ${resp.status}`);
  const data = await resp.json();
  return data.results || [];
}

// ── Get item status from Pluggy ──
async function getItem(apiKey, itemId) {
  const resp = await fetch(`${PLUGGY_API}/items/${itemId}`, {
    headers: { 'X-API-KEY': apiKey }
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ── Main sync ──
async function main() {
  console.log('🔄 Iniciando sync Pluggy Open Finance...');

  const apiKey = await pluggyAuth();
  console.log('✅ Autenticado na Pluggy');

  // Listar todos os usuários no devedorapp
  const usersSnap = await db.collection('devedorapp').listDocuments();
  console.log(`📋 ${usersSnap.length} usuário(s) encontrado(s)`);

  let totalOk = 0, totalErr = 0;

  for (const userDoc of usersSnap) {
    const uid = userDoc.id;
    const itemsSnap = await db.collection(`devedorapp/${uid}/pluggy_items`).get();

    if (itemsSnap.empty) {
      console.log(`  ⏭️  ${uid}: sem itens Pluggy`);
      continue;
    }

    console.log(`  👤 ${uid}: ${itemsSnap.size} item(ns) Pluggy`);

    for (const itemDoc of itemsSnap.docs) {
      const itemId = itemDoc.id;
      const itemData = itemDoc.data();
      const connectorName = itemData.connectorName || 'Banco';

      try {
        // 1. Atualizar status do item
        const pluggyItem = await getItem(apiKey, itemId);
        if (!pluggyItem) {
          console.log(`    ❌ Item ${itemId} não encontrado na Pluggy`);
          totalErr++;
          continue;
        }

        await itemDoc.ref.update({
          status: pluggyItem.status,
          atualizadoEm: FieldValue.serverTimestamp()
        });

        // 2. Buscar contas
        const accounts = await fetchAccounts(apiKey, itemId);
        console.log(`    🏦 ${connectorName}: ${accounts.length} conta(s)`);

        // 3. Atualizar cada conta no Firestore
        for (const acc of accounts) {
          const docId = `pluggy_${acc.id}`;
          const isCredit = acc.type === 'CREDIT' || acc.subtype === 'CREDIT_CARD';
          const tipoMap = {
            'CHECKING_ACCOUNT': 'corrente',
            'SAVINGS_ACCOUNT': 'poupanca',
            'CREDIT_CARD': 'cartao'
          };
          const tipo = tipoMap[acc.subtype] || (isCredit ? 'cartao' : 'corrente');
          const saldo = isCredit ? 0 : (acc.balance || 0);
          const limite = isCredit
            ? (acc.creditData?.creditLimit || 0)
            : (tipo === 'corrente' ? (acc.creditData?.creditLimit || 0) : 0);
          const faturaUsada = isCredit
            ? (limite - (acc.creditData?.availableCreditLimit || 0))
            : 0;

          await db.doc(`devedorapp/${uid}/bancos/${docId}`).set({
            nome: connectorName + (accounts.length > 1 ? ' — ' + (acc.name || tipo) : ''),
            tipo,
            saldo,
            limite,
            fatura: faturaUsada > 0 ? faturaUsada : 0,
            obs: acc.number ? 'Conta: ****' + acc.number.slice(-4) : '',
            cor: BANK_COLORS[connectorName] || '#5b8def',
            icon: BANK_ICONS[connectorName] || '🏦',
            pluggyItemId: itemId,
            pluggyAccountId: acc.id,
            pluggySubtype: acc.subtype || '',
            atualizadoEm: FieldValue.serverTimestamp(),
            criadoEm: FieldValue.serverTimestamp()
          }, { merge: true });

          console.log(`      ✅ ${acc.name || tipo}: saldo=${saldo}, limite=${limite}, fatura=${faturaUsada > 0 ? faturaUsada : 0}`);
        }

        totalOk++;
      } catch (err) {
        console.error(`    ❌ Erro item ${itemId}: ${err.message}`);
        totalErr++;
      }
    }
  }

  console.log(`\n🏁 Sync concluído: ${totalOk} ok, ${totalErr} erro(s)`);
  if (totalErr > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
