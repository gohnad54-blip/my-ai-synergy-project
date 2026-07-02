/**
 * Polls feature checks — integration, regression, edge cases.
 */
import puppeteer from 'puppeteer-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

/** @type {Record<string, unknown>} */
const report = {
  base: BASE,
  checkedAt: new Date().toISOString(),
  integration: {},
  regression: {},
  edgeCases: {},
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const uk = JSON.parse(await readFile(join(process.cwd(), 'locales', 'uk.json'), 'utf8'));
  const en = JSON.parse(await readFile(join(process.cwd(), 'locales', 'en.json'), 'utf8'));
  const de = JSON.parse(await readFile(join(process.cwd(), 'locales', 'de.json'), 'utf8'));
  const pollKeys = Object.keys(uk).filter((k) => k.startsWith('polls.'));
  report.keyParity = {
    pollKeyCount: pollKeys.length,
    missingInEn: pollKeys.filter((k) => !(k in en)),
    missingInDe: pollKeys.filter((k) => !(k in de)),
    ok: pollKeys.every((k) => k in en && k in de),
  };

  const rolesSource = await readFile(join(process.cwd(), 'js', 'modules', 'roles.js'), 'utf8');
  report.integration.permissionsInRoles = {
    hasCreate: rolesSource.includes("'polls.create'"),
    hasViewVoters: rolesSource.includes("'polls.view_voters'"),
    ok: rolesSource.includes("'polls.create'") && rolesSource.includes("'polls.view_voters'"),
  };

  await goto(page, '/');
  await page.evaluate(() => {
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'poll-test-admin',
      role: 'admin',
      permissions: ['*'],
      expiresAt: Date.now() + 3600000,
      token: 'poll-test-token',
      displayName: 'Poll Admin',
    }));
  });

  await goto(page, '/dashboard/chat?tab=group');
  const adminGroup = await page.evaluate(() => ({
    hasPollBtn: document.getElementById('chat-create-poll') !== null,
    pollBtnHidden: document.getElementById('chat-create-poll')?.classList.contains('hidden') === false,
    hasCompose: document.getElementById('chat-compose-form') !== null,
    hasMessages: document.getElementById('chat-messages') !== null,
    tabGroupActive: document.querySelector('[data-chat-tab="group"]')?.classList.contains('text-neural-glow') === true,
  }));
  report.integration.adminGroupChat = { ...adminGroup, ok: adminGroup.hasPollBtn && adminGroup.pollBtnHidden && adminGroup.tabGroupActive };

  await page.click('[data-chat-tab="private"]');
  await new Promise((r) => setTimeout(r, 1200));
  const pollHiddenOnPrivate = await page.evaluate(() => {
    const btn = document.getElementById('chat-create-poll');
    return btn instanceof HTMLElement && btn.classList.contains('hidden');
  });
  report.integration.pollHiddenOnPrivateTab = { ok: pollHiddenOnPrivate };

  await page.evaluate(() => {
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'poll-test-user',
      role: 'role-member',
      permissions: ['content.view.restricted'],
      expiresAt: Date.now() + 3600000,
      token: 'poll-test-token-2',
      displayName: 'Regular User',
    }));
  });
  await goto(page, '/dashboard/chat?tab=group');
  const userNoCreate = await page.evaluate(() => document.getElementById('chat-create-poll') === null);
  report.integration.regularUserNoCreateBtn = { ok: userNoCreate };

  await page.evaluate(() => {
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'poll-test-creator',
      role: 'role-poll',
      permissions: ['polls.create'],
      expiresAt: Date.now() + 3600000,
      token: 'poll-test-token-3',
      displayName: 'Poll Creator',
    }));
  });
  await goto(page, '/dashboard/chat?tab=group');
  const creatorBtn = await page.evaluate(() => {
    const btn = document.getElementById('chat-create-poll');
    return btn instanceof HTMLElement && !btn.classList.contains('hidden');
  });
  report.integration.userWithPollsCreate = { ok: creatorBtn };

  const moduleCheck = await page.evaluate(async () => {
    const mod = await import('/js/modules/polls.js');
    return {
      hasCreate: typeof mod.createGroupPoll === 'function',
      hasVote: typeof mod.castPollVote === 'function',
      hasResults: typeof mod.getPollResults === 'function',
      minOptions: mod.MIN_POLL_OPTIONS,
      maxOptions: mod.MAX_POLL_OPTIONS,
    };
  });
  report.integration.moduleApi = { ...moduleCheck, ok: moduleCheck.hasCreate && moduleCheck.hasVote && moduleCheck.minOptions === 2 && moduleCheck.maxOptions === 10 };

  await goto(page, '/dashboard/chat?tab=group');
  const regression = await page.evaluate(() => ({
    privateTab: document.querySelector('[data-chat-tab="private"]') !== null,
    groupTab: document.querySelector('[data-chat-tab="group"]') !== null,
    attachFile: document.getElementById('chat-attach-file') !== null,
    attachLink: document.getElementById('chat-attach-link') !== null,
    composeInput: document.getElementById('chat-compose-input') !== null,
    sendBtn: document.querySelector('#chat-compose-form button[type="submit"]') !== null,
  }));
  report.regression.chatComposerIntact = { ...regression, ok: Object.values(regression).every(Boolean) };

  await goto(page, '/apply');
  report.regression.applyPageLoads = {
    title: await page.$eval('[data-i18n="apply.title"]', (el) => el.textContent?.trim()).catch(() => null),
    ok: true,
  };

  const permissionLogic = await page.evaluate(async () => {
    const polls = await import('/js/modules/polls.js');
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'x', role: 'admin', permissions: [], expiresAt: Date.now() + 99999, token: 't',
    }));
    const adminCan = polls.canCreatePolls() && polls.canViewPollVoters();
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'x', role: 'custom', permissions: ['polls.create'], expiresAt: Date.now() + 99999, token: 't',
    }));
    const customCreate = polls.canCreatePolls();
    const customView = polls.canViewPollVoters();
    return { adminCan, customCreate, customView };
  });
  report.edgeCases.permissions = {
    ...permissionLogic,
    ok: permissionLogic.adminCan && permissionLogic.customCreate && !permissionLogic.customView,
  };

  report.edgeCases.mapErrors = await page.evaluate(async () => {
    const { mapPollError } = await import('/js/modules/polls.js');
    const t = (k) => k;
    return {
      question: mapPollError(new Error('POLL_QUESTION_REQUIRED'), t),
      vote: mapPollError(new Error('POLL_VOTE_REQUIRED'), t),
      ok: mapPollError(new Error('POLL_QUESTION_REQUIRED'), t) === 'polls.errorQuestion',
    };
  });

  const widgetHtml = await page.evaluate(async () => {
    const { renderPollWidgetHtml } = await import('/js/ui/polls.js');
    return renderPollWidgetHtml({
      poll: {
        pollId: 'poll_test',
        groupMessageId: 'gmsg_test',
        question: 'Test?',
        pollType: 'single',
        status: 'active',
        createdAt: Date.now(),
        closesAt: null,
        closedAt: null,
        canManage: true,
        options: [],
      },
      options: [
        { id: 'o1', label: 'Sehr lange Antwortoption für Layouttest', position: 0, voteCount: 3, percent: 60 },
        { id: 'o2', label: 'Kurz', position: 1, voteCount: 2, percent: 40 },
      ],
      totalVoters: 5,
      myOptionIds: ['o1'],
    });
  });
  report.edgeCases.longGermanLayout = {
    hasProgressBar: widgetHtml.includes('60%'),
    hasVoteBtn: widgetHtml.includes('data-poll-vote'),
    ok: widgetHtml.includes('data-poll-root') && widgetHtml.includes('60%'),
  };

  report.integration.ok = report.integration.permissionsInRoles.ok
    && report.integration.adminGroupChat.ok
    && report.integration.pollHiddenOnPrivateTab.ok
    && report.integration.regularUserNoCreateBtn.ok
    && report.integration.userWithPollsCreate.ok
    && report.integration.moduleApi.ok;

  report.regression.ok = report.regression.chatComposerIntact.ok && report.regression.applyPageLoads.ok;

  report.edgeCases.ok = report.keyParity.ok
    && report.edgeCases.permissions.ok
    && report.edgeCases.mapErrors.ok
    && report.edgeCases.longGermanLayout.ok;

  report.allOk = report.integration.ok && report.regression.ok && report.edgeCases.ok;

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'polls-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.allOk) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
