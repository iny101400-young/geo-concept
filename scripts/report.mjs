#!/usr/bin/env node
// geo-skills · 이니 (iny) · https://iny-young.com · f20fb48b2423
/**
 * geo-concept 결과 만들기 (사용자 프로젝트 폴더에서 실행)
 *
 *   node <skill>/scripts/report.mjs
 *
 * geo/concept.json 하나를 읽어 세 파일을 만든다.
 *   geo/concept.md            사람이 읽는 정리본
 *   geo/site-copy.json        geo-site 가 읽는 사이트 문구
 *   geo/concept-report.html   브라우저로 여는 리포트
 * 열 파일 경로를 마지막 줄에 찍는다. 외부로 아무것도 보내지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

const GEO = path.join(process.cwd(), "geo");
const SRC = path.join(GEO, "concept.json");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const len = (s) => [...String(s || "")].length;

const LIMIT = { ko: [30, 80], ja: [30, 80], "zh-Hans": [30, 80], "zh-Hant": [30, 80], other: [60, 150] };
const limitOf = (code) => LIMIT[code] || LIMIT.other;
const BANNED = /최고|1위|넘버원|No\.?\s?1|#1|유일|업계 최다|국내 최초|완벽|보장|무조건|100%|\bbest\b|\bleading\b|最高|一番/gi;
const REGULATED = /치료|완치|효과 보장|부작용 없|통증 없|승소율|수익 보장|원금 보장/g;

// 질문 층 (geo-text 와 같은 기준)
const LAYER = {
  3: { name: "3층 · 넓은 말", what: "누구나 검색하는 말. 경쟁이 세서 가장 늦게 잡혀요", shape: "롱테일 검색어 (3~5 낱말)" },
  2: { name: "2층 · 손님 상황", what: "내 손님이 자기 상황을 붙여 묻는 말", shape: "손님 말투 문장" },
  1: { name: "1층 · 내 다른 점", what: "내 자료 · 다른 점이 있어야 답할 수 있는 말. 가장 먼저 잡혀요", shape: "문장 (내 이름은 빼고)" },
};
const layerOf = (m) => Number(m.layer) || (/롱테일/.test(m.type || "") ? 3 : 0);

const SIGNUP = {
  인스타그램: ["instagram.com 또는 앱에서 계정 만들기", "설정 → 계정 유형 → 프로페셔널 계정으로 전환 (무료)", "프로필 편집에서 이름 · 소개 · 링크"],
  스레드: ["threads.com 또는 앱 · 인스타그램 계정으로 로그인", "인스타 프로필 가져오기", "소개 · 링크 확인"],
  링크드인: ["linkedin.com 가입", "개인: 이름 · 헤드라인 · 웹사이트 칸 / 회사: 비즈니스 메뉴 → 회사 페이지 만들기", "로고 · 소개 · 웹사이트 주소"],
  유튜브: ["구글 계정으로 youtube.com 로그인", "채널 만들기", "채널 이름 · 핸들(@아이디) · 설명 · 링크"],
  블로그: ["네이버 블로그 또는 티스토리 가입", "블로그 이름 · 소개", "프로필에 사이트 주소"],
};

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`geo/concept.json 이 없어요: ${SRC}`);
  const c = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const checks = lint(c);
  writeMd(c);
  writeSiteCopy(c);
  const out = path.join(GEO, "concept-report.html");
  fs.writeFileSync(out, html(c, checks));
  console.log(path.join(GEO, "concept.md"));
  console.log(path.join(GEO, "site-copy.json"));
  if (checks.some((x) => x.level === "bad")) console.log(`✕ 고칠 것 ${checks.filter((x) => x.level === "bad").length}개 · 리포트 「점검」을 보세요`);
  console.log(out);
}

/* ── 점검 ─────────────────────────────────────────────── */
function lint(c) {
  const out = [];
  const add = (level, label, detail) => out.push({ level, label, detail });
  const [tMax, dMax] = limitOf("ko");
  add(c.title && len(c.title) <= tMax ? "ok" : "warn", "사이트 제목", `${len(c.title)} / ${tMax}자`);
  add(c.description && len(c.description) <= dMax ? "ok" : "warn", "사이트 설명", `${len(c.description)} / ${dMax}자`);
  if (c.keyword) {
    const miss = c.keyword.split(/\s+/).filter((w) => w && !String(c.title || "").includes(w));
    add(miss.length ? "warn" : "ok", "검색하는 말이 제목에", miss.length ? `「${miss.join(" ")}」가 제목에 없어요` : `「${c.keyword}」 낱말이 다 있어요`);
  }
  const titles = [["사이트 제목", c.title], ...Object.values(c.locales || {}).map((l) => [`${l.lang || ""} 제목`, l.title])];
  for (const [lab, t] of titles) {
    const seps = (String(t || "").match(/[·|｜\-–—]/g) || []).length;
    add(seps > 1 ? "warn" : "ok", `${lab} 나열`, seps > 1 ? `구분 기호가 ${seps}개예요. 키워드 나열처럼 보여요 · 「한 구절 | 이름」으로` : "한 구절로 읽혀요");
  }
  const all = [c.oneLine, c.title, c.description, c.introShort, c.introLong, ...Object.values(c.locales || {}).flatMap((l) => [l.oneLine, l.title, l.description, l.introShort])].join(" ");
  const bad = [...new Set(all.match(BANNED) || [])];
  add(bad.length ? "bad" : "ok", "과장 낱말", bad.length ? `${bad.join(", ")} · 근거가 없으면 빼요` : "없어요");
  if (c.regulated) {
    const reg = [...new Set(all.match(REGULATED) || [])];
    add(reg.length ? "bad" : "ok", "규제 업종 표현", reg.length ? reg.join(", ") : "없어요 · 그래도 올리기 전에 광고 규정을 확인해요");
  }
  const ms = c.measure || [];
  add(ms.length === 3 ? "ok" : "bad", "측정 질문 수", `${ms.length}개 (3개)`);
  const layers = ms.map(layerOf);
  const missing = [3, 2, 1].filter((l) => !layers.includes(l));
  add(missing.length ? "warn" : "ok", "질문 층", missing.length ? `${missing.map((l) => LAYER[l].name).join(" · ")} 이 없어요 · 층마다 하나씩` : "3층 · 2층 · 1층이 하나씩 있어요");
  const short = ms.filter((m) => layerOf(m) === 3 && m.q.trim().split(/\s+/).length < 3);
  add(short.length ? "warn" : "ok", "3층 롱테일 길이", short.length ? short.map((m) => `「${m.q}」`).join(" ") + " · 너무 짧아요. 지역 · 대상 · 조건을 붙여 3~5 낱말로" : "3낱말 이상이에요");
  const flat = ms.filter((m) => layerOf(m) !== 3 && !/[?？]\s*$/.test(m.q));
  add(flat.length ? "warn" : "ok", "2 · 1층은 문장으로", flat.length ? flat.map((m) => `「${m.q}」`).join(" ") + " · 손님이 AI 에 묻는 문장으로 (물음표로 끝나게)" : "문장이에요");
  const named = ms.filter((m) => [c.name, c.nameEn].filter(Boolean).some((n) => m.q.includes(n)));
  add(named.length ? "bad" : "ok", "측정 질문에 내 이름", named.length ? named.map((m) => `「${m.q}」`).join(" ") + " · 이름을 빼요" : "없어요");
  const unsure = (c.evidence || []).filter((e) => e.status === "확인 필요");
  const leaked = unsure.filter((e) => { const num = (e.item.match(/\d+/) || [])[0]; return num && all.includes(num); });
  add(leaked.length ? "bad" : "ok", "확인 안 된 숫자", leaked.length ? leaked.map((e) => e.item).join(", ") + " · 문구에서 빼요" : "문구에 없어요");
  for (const [code, l] of Object.entries(c.locales || {})) {
    const [lt, ld] = limitOf(code);
    add(len(l.title) <= lt + 4 && len(l.description) <= ld + 10 ? "ok" : "warn", `${l.lang || code} 글자 수`, `제목 ${len(l.title)} · 설명 ${len(l.description)} (약 ${lt} · ${ld})`);
  }
  return out;
}

/* ── concept.md ───────────────────────────────────────── */
const qText = (q) => (typeof q === "string" ? q : q.q);
const qLayer = (q) => (typeof q === "string" ? 0 : Number(q.layer) || 0);

function writeMd(c) {
  const t = (rows, head) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
  const intro = (ch) => (ch.intro === "short" ? c.introShort : ch.intro === "long" ? c.introLong : ch.intro || "");
  const parts = [
    `# 컨셉 · ${c.nameDisplay || c.name}`,
    `- 유형: ${c.type}${c.industry ? " · " + c.industry : ""}${c.goal ? " · " + c.goal : ""}`,
    `- 사이트 상황: ${c.siteStatus}${c.siteUrl ? " · " + c.siteUrl : ""} · 모드: ${c.mode}`,
    `- 고친 날: ${c.date}`,
  ];
  const abl = (Array.isArray(c.aiBefore) ? c.aiBefore : c.aiBefore ? [c.aiBefore] : []).filter((a) => a && a.answer);
  if (abl.length) parts.push(`\n## 지금 AI 가 아는 나 (${abl[0].date || ""} · 사용자가 직접 물어 붙여 넣은 답)\n- 물어본 말: ${abl[0].question}\n${abl.map((a) => `- ${a.engine} · ${a.verdict || ""} · ${a.answer}`).join("\n")}\n- 같은 곳에 5주 뒤 같은 말로 다시 물어서 「한 줄」에 가까워졌는지 봐요. 이 AI 들을 실험 설계서 「테스트할 곳」으로.`);
  parts.push(`\n## 한 줄 (AI 가 나를 소개할 말)\n${c.oneLine}`);
  parts.push(`\n## 누구에게 · 무엇을 · 어떻게\n- 누구에게: ${c.who}\n- 무엇을: ${c.what}\n- 어떻게: ${c.how}\n- 검색하는 말: ${c.keyword}\n- 알릴 범위: ${c.scope}${c.area ? " · " + c.area : ""}\n- 바라는 행동: ${c.action}\n- 이름 표기: ${c.nameDisplay || c.name}`);
  parts.push(`\n## 사이트 문구\n- 제목: ${c.title}\n- 설명: ${c.description}\n- 소개문 짧게: ${c.introShort}\n- 소개문 길게: ${c.introLong}`);
  if (c.before) parts.push(`\n## 고치기 전\n- 한 줄: ${c.before.oneLine || "없음"}\n- 제목: ${c.before.title || "없음"}\n- 설명: ${c.before.description || "없음"}\n- 첫 화면: ${c.before.hero || "없음"}\n- 읽은 방법: ${c.before.readFrom || ""}`);
  const ms = [...(c.measure || [])].sort((a, b) => layerOf(b) - layerOf(a));
  parts.push(`\n## 측정 질문 (층마다 하나 · 내 이름 없음 · 5주 동안 그대로)\n${t(ms.map((m) => [LAYER[layerOf(m)]?.name || m.type || "", m.q]), ["층", "질문"])}\n\n좁은 1층부터 잡히고 위로 넓혀 가요. 재는 법: 실험 설계서의 「테스트할 곳」마다 새 창 · 로그인 안 한 상태로 한 번씩 묻고, 내 이름이 나온 질문 수를 「1 / 3」처럼 적어요.`);
  if ((c.measureExtra || []).length) parts.push(`\n## 해외 질문 (선택 · 기준선 3개와 따로)\n${c.measureExtra.map((m) => `- ${m.lang}: ${m.q}`).join("\n")}`);
  parts.push(`\n## 핵심 질문 후보 (위키 · 글감으로)\n${(c.coreQuestions || []).map((q, i) => `${i + 1}. ${qLayer(q) ? `[${qLayer(q)}층] ` : ""}${qText(q)}`).join("\n")}`);
  parts.push(`\n## 근거 자산\n${t((c.evidence || []).map((e) => [e.item, e.status, e.note || ""]), ["근거", "상태", "메모"])}`);
  parts.push(`\n## 채널\n${t((c.channels || []).map((ch) => [ch.name, ch.core ? "핵심" : "", ch.url || "아직 없음", ch.displayName || "", intro(ch), ch.todo || ""]), ["채널", "핵심", "주소", "이름", "소개", "할 일"])}`);
  if ((c.linkPlan || []).length) parts.push(`\n## 채널 연결 계획\n${c.linkPlan.map((x) => `- ${x}`).join("\n")}`);
  for (const [code, l] of Object.entries(c.locales || {})) parts.push(`\n## ${l.lang || code} (${code}) · 초안 · 원어민 확인 권장\n- 검색하는 말: ${l.keyword}\n- 한 줄: ${l.oneLine}\n- 제목: ${l.title}\n- 설명: ${l.description}\n- 소개문 짧게: ${l.introShort}`);
  if ((c.notes || []).length) parts.push(`\n## 메모\n${c.notes.map((x) => `- ${x}`).join("\n")}`);
  fs.writeFileSync(path.join(GEO, "concept.md"), parts.join("\n") + "\n");
}

/* ── site-copy.json ───────────────────────────────────── */
function writeSiteCopy(c) {
  const o = {
    name: c.name, nameEn: c.nameEn || "", nameDisplay: c.nameDisplay || c.name, type: c.type === "개인" ? "person" : "brand",
    title: c.title, description: c.description, oneLine: c.oneLine, introShort: c.introShort, introLong: c.introLong,
    keyword: c.keyword, area: c.area || "", action: c.action, regulated: !!c.regulated,
    sameAs: (c.channels || []).map((ch) => ch.url).filter((u) => /^https?:\/\//.test(u || "")),
    locales: Object.fromEntries(Object.entries(c.locales || {}).map(([k, l]) => [k, { oneLine: l.oneLine, title: l.title, description: l.description, introShort: l.introShort, keyword: l.keyword }])),
    updated: c.date,
  };
  fs.writeFileSync(path.join(GEO, "site-copy.json"), JSON.stringify(o, null, 2) + "\n");
}

/* ── 리포트 ───────────────────────────────────────────── */
const CSS = `
:root{--bg:#f6f6f8;--paper:#fff;--ink:#1f1d26;--sub:#6b6878;--faint:#9a97a6;--line:#e8e6ee;--accent:#5b3fd1;--soft:#f1eefc;--warn:#8a5a0b;--warn-soft:#f8f1e2;--bad:#a1322c;--bad-soft:#f8e8e6;--ok:#1d7a4f;--ok-soft:#e6f4ec}
@media (prefers-color-scheme:dark){:root{--bg:#141319;--paper:#1c1b23;--ink:#e9e7f2;--sub:#a5a2b5;--faint:#77748a;--line:#2e2c39;--accent:#b3a1ff;--soft:#25213a;--warn:#e2b75c;--warn-soft:#2f2715;--bad:#ef8d85;--bad-soft:#351c1a;--ok:#7fd3a6;--ok-soft:#163025;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.75 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;word-break:keep-all;padding:0 16px}
.wrap{max-width:760px;margin:0 auto;padding:40px 0 80px}
.kicker{font-size:12.5px;color:var(--faint)}
h1{font-size:26px;line-height:1.35;margin:6px 0 18px;letter-spacing:-.01em}
.lede{color:var(--sub);font-size:14.5px;margin:14px 0 0}
.ask{font-size:13.5px;color:var(--sub);margin-bottom:10px}.ask b{color:var(--ink)}
.now{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 18px;color:var(--sub);font-size:14.5px}
.now .k,.me .k{display:block;font-size:12px;color:var(--faint);margin-bottom:4px}
.down{text-align:center;color:var(--faint);font-size:18px;line-height:1;margin:8px 0}
.me{background:var(--paper);border:1.5px solid var(--accent);border-radius:14px;padding:16px 18px}.me .k{color:var(--accent);font-weight:700}
.me .one{font-size:20px;font-weight:800;line-height:1.5}
.who{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:13.5px;color:var(--sub)}.who b{color:var(--ink);font-weight:700;margin-right:4px}
.verdict{display:inline-block;font-size:11px;font-weight:800;background:var(--warn-soft);color:var(--warn);border-radius:999px;padding:0 8px;margin-left:6px}
.warnbox{background:var(--warn-soft);color:var(--warn);border-radius:12px;padding:12px 16px;font-size:13.5px;margin-top:16px}
section{margin-top:44px}
section > h2{font-size:19px;margin:0;display:flex;align-items:baseline;gap:10px}section > h2 .n{color:var(--accent);font-size:15px}
.what{font-size:13.5px;color:var(--sub);margin:4px 0 16px}
.box{background:var(--paper);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.serp{padding:16px 18px;border-bottom:1px solid var(--line)}.serp .u{font-size:12px;color:var(--faint)}.serp .h{font-size:18px;color:#1a0dab;line-height:1.35;margin:2px 0}.serp .d{font-size:13px;color:var(--sub)}
@media (prefers-color-scheme:dark){.serp .h{color:#8ab4f8}}
.serp .cut{background:var(--warn-soft);color:var(--warn)}
.row{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:start;padding:12px 18px;border-top:1px solid var(--line);font-size:14.5px}.box .row:first-child{border-top:0}
.row .k{font-size:12.5px;color:var(--sub);font-weight:700;padding-top:2px}.row .k small{display:block;font-weight:500;color:var(--faint)}
.row .muted{color:var(--faint)}
button{font:inherit;font-size:12px;font-weight:700;background:var(--soft);color:var(--accent);border:0;border-radius:8px;padding:4px 10px;cursor:pointer;white-space:nowrap}
.done{display:block;font-size:11px;color:var(--ok);text-align:right}
.pill{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap;vertical-align:1px}.p-ok{background:var(--ok-soft);color:var(--ok)}.p-warn{background:var(--warn-soft);color:var(--warn)}.p-bad{background:var(--bad-soft);color:var(--bad)}.p-acc{background:var(--soft);color:var(--accent)}.p-off{background:var(--bg);color:var(--faint);border:1px solid var(--line)}
.todo{font-size:13px;color:var(--sub);margin-top:4px}
.fl{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:start;padding:14px 18px;border-top:1px solid var(--line)}.box .fl:first-child{border-top:0}
.fl .k{font-size:12.5px;font-weight:700}.fl .k small{display:block;font-weight:500;color:var(--faint);font-size:11.5px}
.fl.l3 .k{color:var(--sub)}.fl.l2 .k{color:var(--accent)}.fl.l1 .k{color:var(--accent)}.fl.l1{background:var(--soft)}
.fl .q{font-size:15px;font-weight:700}.fl .q small{display:block;font-weight:500;font-size:12.5px;color:var(--sub);margin-top:2px}
.tip{font-size:13.5px;color:var(--sub);margin:12px 2px 0}.tip b{color:var(--ink)}
.steps{margin:0;padding:0;list-style:none;counter-reset:s;background:var(--paper);border:1px solid var(--line);border-radius:16px}
.steps li{counter-increment:s;display:flex;gap:12px;padding:12px 18px;border-top:1px solid var(--line);font-size:14.5px}.steps li:first-child{border-top:0}
.steps li::before{content:counter(s);flex:none;width:22px;height:22px;margin-top:2px;border-radius:50%;background:var(--soft);color:var(--accent);font-size:12px;font-weight:800;display:grid;place-items:center}
code{font-family:inherit;background:var(--soft);color:var(--accent);padding:1px 8px;border-radius:6px;font-weight:700}
.paste{background:var(--bg);border:1px dashed #cfcbe0;border-radius:10px;padding:9px 12px;font-weight:600;color:var(--ink)}
.paste .lab{display:block;font-size:11px;font-weight:700;color:var(--faint);margin-bottom:2px}
.meta{font-size:12.5px;color:var(--sub);margin-top:6px}.meta b{color:var(--ink);font-weight:700;margin-right:4px}
.todo3{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-top:18px}.todo3 b.t{display:block;font-size:14px;margin-bottom:6px}
.todo3 ol{margin:0;padding-left:20px;font-size:14px}.todo3 li{margin:3px 0}.todo3 a{color:var(--accent);font-weight:700;text-decoration:none}
.more{margin-top:44px;border-top:1px solid var(--line);padding-top:8px}
details{border-bottom:1px solid var(--line);padding:12px 2px}summary{cursor:pointer;font-weight:700;font-size:14.5px}summary span{font-weight:500;color:var(--faint);font-size:13px;margin-left:6px}
details table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:10px}details td,details th{text-align:left;padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}details th{font-size:12px;color:var(--sub)}
details ol{margin:10px 0 0;padding-left:20px;font-size:13.5px;color:var(--sub)}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.vs div{background:var(--bg);border-radius:10px;padding:10px 12px;font-size:13.5px}.vs .k{font-size:11.5px;color:var(--faint);display:block}
@media (max-width:640px){.row,.fl{grid-template-columns:1fr;gap:4px}.vs{grid-template-columns:1fr}h1{font-size:22px}}
`;
const JS = `function cp(id,b){const t=document.getElementById(id).innerText;const ok=()=>{const d=b.nextElementSibling;if(d){d.textContent='복사했어요';setTimeout(()=>d.textContent='',2000)}};navigator.clipboard.writeText(t).then(ok,()=>{const r=document.createRange();r.selectNodeContents(document.getElementById(id));const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');ok()})}`;

function serp(title, desc, url, [tMax, dMax]) {
  return `<div class="serp"><div class="u">${esc(url || "내 사이트 주소")}</div><div class="h">${esc(title || "")}</div><div class="d">${esc(desc || "")}</div></div>`;
}

const SITE_WHERE = { 제목: "사이트 제목 칸 (SEO · 검색 제목)", 설명: "사이트 설명 칸 (SEO · 메타 설명)", "첫 화면 한 줄": "홈 맨 위 큰 문장", "소개 페이지": "소개(About) 페이지 첫 문단" };
const CH_WHERE = { 인스타그램: "프로필 편집 › 소개", 스레드: "프로필 편집 › 소개 (인스타에서 가져와도 돼요)", 블로그: "블로그 관리 › 블로그 소개", 유튜브: "채널 맞춤설정 › 설명", 링크드인: "프로필 › 헤드라인 (회사는 페이지 소개)" };

function html(c, checks) {
  const pill = { ok: '<span class="pill p-ok">○</span>', warn: '<span class="pill p-warn">△</span>', bad: '<span class="pill p-bad">✕</span>' };
  const badN = checks.filter((x) => x.level !== "ok").length;
  const ch = c.channels || [];
  // SNS · 블로그 · 유튜브 프로필은 짧은 소개. 긴 소개는 사이트 소개 페이지에만.
  const intro = (x) => (!x.intro || x.intro === "short" || x.intro === "long" ? c.introShort : x.intro);
  const evPill = { "쓸 수 있음": "p-ok", "확인 필요": "p-warn", "만들면 좋음": "p-acc" };
  const abs = (Array.isArray(c.aiBefore) ? c.aiBefore : c.aiBefore ? [c.aiBefore] : []).filter((a) => a && a.answer);
  const ab = abs[0] || null;
  const name = c.nameDisplay || c.name;
  const noSite = /아직 없음|만드는 중/.test(c.siteStatus || "");
  let n = 0;
  const viewRow = (k, sub, v, where) => `<div class="row"><div class="k">${k}${sub ? `<small>${sub}</small>` : ""}</div><div><div class="paste" style="border-style:solid;background:var(--paper)">${esc(v)}</div>${where ? `<div class="meta"><b>들어갈 곳</b>${esc(where)}</div>` : ""}</div><div></div></div>`;
  const copyRow = (k, sub, v, where) => { const id = `c${n++}`; return `<div class="row"><div class="k">${k}${sub ? `<small>${sub}</small>` : ""}</div><div><div class="paste"><span class="lab">붙일 문구</span><span id="${id}">${esc(v)}</span></div>${where ? `<div class="meta"><b>어디에</b>${esc(where)}</div>` : ""}</div><div><button onclick="cp('${id}',this)">복사</button><span class="done"></span></div></div>`; };

  // 맨 위
  const top = `<div class="kicker">컨셉 리포트 · ${esc(name)} · ${esc(c.date)}</div>
<h1>AI 가 나를 이렇게 소개하게</h1>
${ab ? `<div class="ask">AI ${abs.length}곳에 <b>「${esc(ab.question)}」</b> 를 물으면 · ${esc(ab.date || "")} · 직접 물어 붙여 넣은 답</div>
${abs.map((a) => `<div class="now" style="margin-top:8px"><span class="k">지금 · ${esc(a.engine || "AI")}<span class="verdict">${esc(a.verdict || "")}</span></span>${esc(a.answer)}</div>`).join("")}
<div class="tip" style="margin:6px 2px 0;font-size:12px">판정은 붙여 넣은 답을 보고 Claude 가 붙였어요. 이 ${abs.length}곳을 실험 설계서 「테스트할 곳」에 그대로 쓰면 5주 뒤 같은 곳에서 비교할 수 있어요.</div>
<div class="down">↓</div>` : ""}
<div class="me"><span class="k">이렇게 말하게 · 내가 정한 한 줄</span><div class="one">${esc(c.oneLine)}</div>
<div class="who"><span><b>누구에게</b>${esc(c.who)}</span><span><b>무엇을</b>${esc(c.what)}</span><span><b>어떻게</b>${esc(c.how)}</span></div></div>
<p class="lede">AI 는 사이트와 SNS 에 적힌 소개를 모아서 답해요. 그래서 이 한 줄을 여러 곳에 같은 말로 붙여 둬요.</p>
<div class="todo3"><b class="t">이 리포트로 할 일</b><ol><li><a href="#s1">①</a> ${noSite ? "사이트 문구 확인하기 · 다음에 「사이트 설계해 줘」(geo-site 스킬)로 만들면 자동으로 들어가요" : "사이트 제목 · 설명 · 첫 화면 · 소개 페이지 바꾸기"}</li><li><a href="#s2">②</a> SNS 프로필 소개 바꾸기</li><li><a href="#s3">③</a> 질문 3개를 실험 설계서 「AI 답변에 내 이름」 칸에 옮기기</li></ol></div>
${c.regulated ? `<div class="warnbox">이 업종은 광고 규정이 있어요. 올리기 전에 협회 기준이나 전문가 확인을 받아 주세요. 이 리포트는 규정을 판단하지 않아요.</div>` : ""}`;

  // ① 사이트
  const before = c.before ? `<details style="border:0;padding:12px 2px 0"><summary>고치기 전과 비교 <span>${esc(c.before.readFrom || "")}</span></summary>
<div class="vs"><div><span class="k">지금 제목</span>${esc(c.before.title || "없음")}</div><div><span class="k">새 제목</span>${esc(c.title)}</div>
<div><span class="k">지금 첫 화면 · 소개</span>${esc(c.before.hero || c.before.oneLine || "없음")}</div><div><span class="k">새 첫 화면</span>${esc(c.introShort)}</div></div>
${(c.diagnosis || []).length ? `<table>${c.diagnosis.map((d) => `<tr><td>${esc(d.item)}</td><td><span class="pill ${/빠짐|없음|근거 없음/.test(d.state) ? "p-warn" : "p-ok"}">${esc(d.state)}</span></td><td>${esc(d.note || "")}</td></tr>`).join("")}</table>` : ""}</details>` : "";
  const locales = Object.entries(c.locales || {});
  const locHtml = locales.length ? `<details style="border:0;padding:12px 2px 0"><summary>다른 나라 말 <span>${locales.map(([k, l]) => esc(l.lang || k)).join(" · ")} · 초안이에요</span></summary>${locales.map(([code, l]) => `<div class="box" style="margin-top:10px">${serp(l.title, l.description, (c.siteUrl || "내 사이트 주소") + "/" + code.toLowerCase() + "/", limitOf(code))}${copyRow("한 줄", esc(l.lang || code), l.oneLine)}${copyRow("소개 짧게", "", l.introShort)}</div>`).join("")}</details>` : "";
  const cnt = (v, max) => `<span class="pill ${len(v) <= max ? "p-ok" : "p-warn"}">${len(v)} / ${max}자</span>`;
  const rowsBy = (f) => `${f("제목", cnt(c.title, 30), c.title, SITE_WHERE["제목"])}${f("설명", cnt(c.description, 80), c.description, SITE_WHERE["설명"])}${f("첫 화면 한 줄", "", c.introShort, SITE_WHERE["첫 화면 한 줄"])}${f("소개 페이지", "첫 문단", c.introLong, SITE_WHERE["소개 페이지"])}`;
  const askId = `c${n++}`;
  const siteHow = noSite
    ? `<p class="what"><b>복사할 필요 없어요.</b> 이 문구는 <code>geo/site-copy.json</code> 파일로 저장돼 있어요. 다음에 Claude Code 창에 <code>사이트 설계해 줘</code>(geo-site 스킬)라고 하면 이 파일을 읽어 자동으로 넣어요. 검색 결과에는 이렇게 보여요. 제목은 30자 · 설명은 80자 안으로 맞췄어요(검색 결과에서 잘리지 않게 하려는 기준이에요).</p>
<div class="box">${serp(c.title, c.description, c.siteUrl, limitOf("ko"))}${rowsBy(viewRow)}</div>`
    : `<p class="what">검색 결과에는 이렇게 보여요. 제목은 30자 · 설명은 80자 안으로 맞췄어요. 사이트를 어떻게 만들었는지에 따라 바꾸는 법이 달라요.</p>
<div class="box">${serp(c.title, c.description, c.siteUrl, limitOf("ko"))}
<div class="row"><div class="k">직접 만든 사이트<small>코드로 만든 사이트</small></div><div><div class="paste"><span class="lab">Claude Code 에 이렇게 요청해요</span><span id="${askId}">geo/site-copy.json 에 있는 문구로 내 사이트를 바꿔 줘. 사이트 제목 · 설명(메타) · 홈 맨 위 큰 문장 · 소개 페이지 첫 문단 네 곳이야.</span></div><div class="meta"><b>복사 안 해도 돼요</b>파일을 읽고 네 곳을 한 번에 고쳐요</div></div><div><button onclick="cp('${askId}',this)">복사</button><span class="done"></span></div></div></div>
<p class="lab2" style="font-size:12.5px;color:var(--sub);font-weight:700;margin:16px 2px 8px">아임웹 · 카페24 같은 빌더라면 · 관리 화면 칸이 따로 있어서 칸마다 복사해요</p>
<div class="box">${rowsBy(copyRow)}</div>`;
  const sec1 = `<section id="s1"><h2><span class="n">①</span>${noSite ? "사이트에 들어갈 문구" : "사이트 문구 바꾸기"}</h2>${siteHow}${before}${locHtml}</section>`;

  // ② SNS
  const status = (x) => (x.core ? '<span class="pill p-acc">핵심</span>' : x.url ? '<span class="pill p-off">있음</span>' : '<span class="pill p-off">없음</span>');
  const sec2 = `<section id="s2"><h2><span class="n">②</span>SNS 프로필도 같은 말로</h2><p class="what">이름과 소개가 어디서나 같아야 AI 가 같은 곳으로 알아봐요. 프로필 소개는 모두 같은 짧은 문장이에요.</p>
<div class="box">${ch.map((x) => { const id = `c${n++}`; return `<div class="row"><div class="k">${esc(x.name)} ${status(x)}<small>${esc(x.url ? x.url.replace(/^https?:\/\//, "") : "아직 없음")}</small></div><div>${x.current && x.current.intro ? `<div class="meta" style="margin:0 0 6px"><b>지금</b>${esc(x.current.intro)}${x.current.readFrom ? ` · ${esc(x.current.readFrom)}` : ""}</div>` : ""}<div class="paste"><span class="lab">${x.current && x.current.intro ? "바꿀 문구" : "붙일 문구"}</span><span id="${id}">${esc(intro(x))}</span></div><div class="meta"><b>어디에</b>${esc(CH_WHERE[x.name] || "프로필 소개 칸")} · 이름 칸은 「${esc(x.displayName || name)}」</div><div class="meta"><b>할 일</b>${esc(x.todo || "")}</div>${x.signup && SIGNUP[x.name] ? `<div class="meta"><b>만들기</b>${SIGNUP[x.name].map(esc).join(" → ")}</div>` : ""}</div><div><button onclick="cp('${id}',this)">복사</button><span class="done"></span></div></div>`; }).join("")}</div>
${(c.linkPlan || []).length ? `<p class="tip"><b>사이트로 잇기</b> · ${c.linkPlan.map(esc).join(" · ")}</p>` : ""}</section>`;

  // ③ 질문 3층
  const ms = c.measure || [];
  const floor = (l) => ms.filter((m) => layerOf(m) === l).map((m) => { const id = `c${n++}`; return `<div class="fl l${l}"><div class="k">${LAYER[l].name}<small>${LAYER[l].shape}</small></div><div class="q"><span id="${id}">${esc(m.q)}</span><small>${LAYER[l].what}</small></div><div><button onclick="cp('${id}',this)">복사</button><span class="done"></span></div></div>`; }).join("");
  const sec3 = `<section id="s3"><h2><span class="n">③</span>실험 설계서에 옮길 질문</h2><p class="what">5주 동안 AI 에게 물어볼 질문 3개예요. 실험 설계서 「AI 답변에 내 이름 (질문 3개 중)」 칸에 그대로 옮겨요. 층마다 하나, 내 이름은 넣지 않았어요.</p>
<div class="box">${floor(3)}${floor(2)}${floor(1)}</div>
${(c.measureExtra || []).length ? `<p class="lab2" style="font-size:12.5px;color:var(--sub);font-weight:700;margin:14px 2px 8px">해외 질문 · 선택 · 기준선 3개와 따로 재요</p><div class="box">${c.measureExtra.map((m) => { const id = `c${n++}`; return `<div class="fl"><div class="k">${esc(m.lang || "")}<small>그 나라 말 · 손님 상황</small></div><div class="q"><span id="${id}">${esc(m.q)}</span></div><div><button onclick="cp('${id}',this)">복사</button><span class="done"></span></div></div>`; }).join("")}</div>` : ""}
<p class="tip">좁은 1층부터 잡히고 위로 넓혀 가요.${ab ? ` 맨 위 「${esc(ab.question)}」도 설계서에 같이 적어 두면 5주 뒤 비교할 수 있어요.` : ""}</p></section>`;

  const next = /아직 없음|만드는 중/.test(c.siteStatus) ? "다음은 사이트예요 → Claude Code 창에 <code>사이트 설계해 줘</code>" : /회사|승인/.test(c.siteStatus) ? "회사 사이트를 바로 못 고치면 실험용 사이트를 따로 열어요 → <code>사이트 설계해 줘</code>" : "사이트 제목 · 설명 · 첫 화면을 ① 문구로 바꾸고 → <code>위키 만들어 줘</code>";
  const sec4 = `<section><h2><span class="n">→</span>다음 스킬</h2><p class="what"></p><ol class="steps"><li><span>${next}</span></li></ol></section>`;

  // 더 보기
  const cq = c.coreQuestions || [];
  const answers = c.answers || [];
  const more = `<div class="more">
<details><summary>내 말을 믿게 해 줄 근거 <span>${(c.evidence || []).length}개 · 「확인 필요」는 문구에 넣지 않았어요</span></summary><table>${(c.evidence || []).map((e) => `<tr><td>${esc(e.item)}</td><td><span class="pill ${evPill[e.status] || "p-acc"}">${esc(e.status)}</span></td><td style="color:var(--sub)">${esc(e.note || "")}</td></tr>`).join("") || "<tr><td>아직 없어요. 위키를 만들면서 모아요.</td></tr>"}</table></details>
${cq.length ? `<details><summary>손님이 자주 묻는 질문 <span>위키 · 글감의 출발점</span></summary><table>${cq.map((q) => `<tr><td style="width:1%;white-space:nowrap;color:var(--accent);font-weight:700">${qLayer(q) ? `${qLayer(q)}층` : ""}</td><td>${esc(qText(q))}</td></tr>`).join("")}</table></details>` : ""}
<details${badN ? " open" : ""}><summary>점검 <span>${badN ? `확인할 것 ${badN}개` : "모두 ○"}</span></summary><table>${checks.map((x) => `<tr><td style="width:1%">${pill[x.level]}</td><td style="width:1%;white-space:nowrap">${esc(x.label)}</td><td>${esc(x.detail)}</td></tr>`).join("")}</table></details>
${answers.length ? `<details><summary>내가 답한 것 <span>${answers.length}개 · 이 결과가 어떤 답에서 나왔는지</span></summary><table>${answers.map((a) => `<tr><td style="width:1%;white-space:nowrap;color:var(--faint)">${esc(a.step || "")}</td><td>${esc(a.q)}</td><td><b>${esc(a.a)}</b></td></tr>`).join("")}</table></details>` : ""}
</div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="geo-concept · 이니 (iny-young.com) · f20fb48b2423"><title>컨셉 리포트 · ${esc(c.name)}</title><style>${CSS}</style></head><body><div class="wrap">${top}${sec1}${sec2}${sec3}${sec4}${more}</div><script>${JS}</script></body></html>`;
}

try {
  main();
} catch (e) {
  console.log(`✕ ${e.message}`);
  process.exitCode = 1;
}
