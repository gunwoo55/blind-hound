import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const secretPattern = /(api[_-]?key|authorization|bearer|token)\s*[:=]\s*['\"][A-Za-z0-9._-]{12,}/i;

test('정적 UI는 모바일 앱 루트와 필수 화면 탭을 제공한다', () => {
  assert.equal(existsSync(new URL('../index.html', import.meta.url)), true);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /viewport/);
  assert.match(html, /app-root/);
  assert.match(html, /src\/app\.js/);
});

test('배포 파일에는 사용자가 준 API 키 원문이 절대 포함되지 않는다', () => {
  for (const file of ['../index.html', '../src/app.js', '../src/engine.js', '../src/data/case01.js']) {
    const url = new URL(file, import.meta.url);
    assert.equal(existsSync(url), true, `${file} missing`);
    const content = readFileSync(url, 'utf8');
    assert.equal(secretPattern.test(content), false, `${file} appears to contain a secret`);
  }
});

test('배포용 UI는 TruthState를 노출하는 전역 디버그 핸들을 만들지 않는다', () => {
  const content = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(content.includes('BlindHoundDebug'), false);
});

test('모바일 UI 내비게이션은 명령서 폼과 하단 콘텐츠를 가리지 않는다', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tabsRule = css.match(/\.tabs\s*\{([^}]*)\}/)?.[1] || '';
  const footerRule = css.match(/\.footer\s*\{([^}]*)\}/)?.[1] || '';
  assert.equal(/position\s*:\s*(sticky|fixed)/.test(tabsRule), false);
  assert.equal(/position\s*:\s*fixed/.test(footerRule), false);
  assert.match(css, /\.app-root\s*\{\s*padding-bottom\s*:\s*calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
});

test('클라이언트 UI는 진실 상태와 비밀 제안 스레드를 직접 노출하지 않는다', () => {
  const content = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(content.includes('game.knowledge.truth'), false);
  assert.match(content, /item\.kind !== 'secret'/);
});

test('턴 로그 렌더링은 재접속용으로 redacted 된 악역 행동 목록을 허용한다', () => {
  const content = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(content, /log\.villainActions\?\.length \?\? log\.villainResults\?\.length/);
});
