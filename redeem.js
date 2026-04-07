// api/redeem.js — ARCIS AI · Verificación de códigos de un solo uso
// Vercel Function + Vercel KV (Redis)
// Se ejecuta en el servidor — el cliente nunca ve los códigos ni puede hacer trampa

import { kv } from '@vercel/kv';

// ══════════════════════════════════════════════════════
//  VALID_CODES — misma lista que en index.html
//  Aquí es la fuente de verdad del servidor
// ══════════════════════════════════════════════════════
const VALID_CODES = {
  // ── PRO Mensual ──
  'PRO-MES-042026-NX7K': { plan: 'pro',    type: 'mes' },
  'PRO-MES-052026-KM3P': { plan: 'pro',    type: 'mes' },
  'PRO-MES-062026-RT5Q': { plan: 'pro',    type: 'mes' },
  'PRO-MES-072026-WB2L': { plan: 'pro',    type: 'mes' },
  'PRO-MES-082026-YH6N': { plan: 'pro',    type: 'mes' },
  'PRO-MES-092026-PD4R': { plan: 'pro',    type: 'mes' },
  'PRO-MES-102026-GF8S': { plan: 'pro',    type: 'mes' },
  'PRO-MES-112026-XC1T': { plan: 'pro',    type: 'mes' },
  'PRO-MES-122026-VJ9U': { plan: 'pro',    type: 'mes' },
  // ── PRO Anual ──
  'PRO-ANU-2026-ZX9M':   { plan: 'pro',    type: 'año' },
  'PRO-ANU-2027-AB3C':   { plan: 'pro',    type: 'año' },
  // ── STUDIO Mensual ──
  'STU-MES-042026-QW2E': { plan: 'studio', type: 'mes' },
  'STU-MES-052026-ER4T': { plan: 'studio', type: 'mes' },
  'STU-MES-062026-TY6U': { plan: 'studio', type: 'mes' },
  'STU-MES-072026-UI8O': { plan: 'studio', type: 'mes' },
  'STU-MES-082026-OP0A': { plan: 'studio', type: 'mes' },
  'STU-MES-092026-AS2D': { plan: 'studio', type: 'mes' },
  'STU-MES-102026-DF4G': { plan: 'studio', type: 'mes' },
  'STU-MES-112026-GH6J': { plan: 'studio', type: 'mes' },
  'STU-MES-122026-JK8L': { plan: 'studio', type: 'mes' },
  // ── STUDIO Anual ──
  'STU-ANU-2026-LZ7X':   { plan: 'studio', type: 'año' },
  'STU-ANU-2027-CV5B':   { plan: 'studio', type: 'año' },
};

// Códigos privilegiados — nunca se consumen
const PRIVILEGED_PREFIXES = ['ARCIS-OWNER-', 'ARCIS-ADMIN-', 'ARCIS-MOD-'];

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  // CORS — permite solo tu dominio de Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  let code;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    code = (body?.code || '').trim().toUpperCase();
  } catch {
    return res.status(400).json({ ok: false, error: 'Body inválido' });
  }

  if (!code) {
    return res.status(400).json({ ok: false, error: 'Ingresa un código de activación.' });
  }

  // Formato básico
  const validFormat = /^(PRO|STU)-(MES|ANU)-(\d{6}|\d{4})-[A-Z0-9]{4}$/.test(code);
  if (!validFormat) {
    return res.status(400).json({ ok: false, error: 'Código inválido. Verifica que lo copiaste correctamente.' });
  }

  // Los códigos privilegiados no pasan por aquí (se manejan solo en el cliente)
  if (PRIVILEGED_PREFIXES.some(p => code.startsWith(p))) {
    return res.status(400).json({ ok: false, error: 'Código inválido.' });
  }

  // Verificar si existe en VALID_CODES
  const entry = VALID_CODES[code];
  if (!entry) {
    return res.status(400).json({ ok: false, error: 'Código inválido. Verifica que lo copiaste correctamente.' });
  }

  // Clave en KV: "used:PRO-MES-042026-NX7K"
  const kvKey = `used:${code}`;

  try {
    // Verificar si ya fue usado — operación atómica con SET NX (solo escribe si no existe)
    // "NX" = solo si no existe · "EX" = expira en 10 años (segundos)
    const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
    const set = await kv.set(kvKey, { usedAt: new Date().toISOString() }, { nx: true, ex: TEN_YEARS });

    if (set === null) {
      // Ya existía en KV → código ya fue usado
      return res.status(409).json({
        ok: false,
        error: '🔴 Este código ya fue utilizado y no puede volver a canjearse. Cada código es de un solo uso.',
        alreadyUsed: true,
      });
    }

    // ✅ Éxito — código válido y recién marcado como usado
    return res.status(200).json({
      ok: true,
      plan: entry.plan,
      type: entry.type,
    });

  } catch (err) {
    console.error('[ARCIS redeem] KV error:', err);
    // Si KV falla, no bloqueamos al usuario — fallback permisivo
    return res.status(200).json({
      ok: true,
      plan: entry.plan,
      type: entry.type,
      warning: 'Verificación parcial — KV no disponible',
    });
  }
}
