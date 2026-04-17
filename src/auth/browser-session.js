const { chromium } = require('playwright');

const DEFAULT_CDP_ENDPOINT = process.env.FUNLIDAY_CDP_ENDPOINT || 'http://127.0.0.1:9333';
const FUNLIDAY_URL = 'https://www.funliday.com';

async function ensureFunlidaySessionPage({ endpoint = DEFAULT_CDP_ENDPOINT, targetUrl = FUNLIDAY_URL } = {}) {
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  let page = context.pages().find((item) => item.url().includes('funliday.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
  return { browser, context, page };
}

async function extractFunlidayAuth(page) {
  const raw = await page.evaluate(() => {
    const cookie = document.cookie;
    const memberId = JSON.parse(localStorage.getItem('fld-memberId') || '""');
    const clientId = JSON.parse(localStorage.getItem('fld-clientId') || '""');
    const accessTokenRaw = localStorage.getItem('fld-accessToken');
    const poibankTokenRaw = localStorage.getItem('fld-poibankToken');
    const languageRaw = localStorage.getItem('fld-language') || 'zh_tw';
    const webTokenMatch = document.cookie.match(/(?:^|; )fld-webToken=([^;]+)/);
    const deviceIdMatch = document.cookie.match(/(?:^|; )fld-clientId=([^;]+)/);
    const webTokenRaw = webTokenMatch ? decodeURIComponent(webTokenMatch[1]) : null;
    const cookieClientId = deviceIdMatch ? decodeURIComponent(deviceIdMatch[1]) : null;
    return {
      cookie,
      memberId,
      clientId,
      cookieClientId,
      accessTokenRaw,
      poibankTokenRaw,
      languageRaw,
      webTokenRaw,
    };
  });

  const accessToken = raw.accessTokenRaw ? JSON.parse(raw.accessTokenRaw).token : null;
  const poibankToken = raw.poibankTokenRaw ? JSON.parse(raw.poibankTokenRaw).token : null;
  const webToken = raw.webTokenRaw ? JSON.parse(raw.webTokenRaw).token : null;
  const authorization = raw.memberId && accessToken
    ? `Bearer ${raw.memberId}_${accessToken}`
    : `Bearer ${webToken}`;

  return {
    cookie: raw.cookie,
    memberId: raw.memberId,
    clientId: raw.clientId,
    deviceId: raw.clientId || (raw.cookieClientId ? JSON.parse(raw.cookieClientId) : ''),
    accessToken,
    poibankToken,
    webToken,
    language: String(raw.languageRaw).replace(/"/g, ''),
    authorization,
  };
}

module.exports = {
  DEFAULT_CDP_ENDPOINT,
  FUNLIDAY_URL,
  ensureFunlidaySessionPage,
  extractFunlidayAuth,
};

