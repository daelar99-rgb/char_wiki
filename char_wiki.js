//@name char_wiki
//@display-name 📖 챠위키 v2.10.4
//@api 3.0
//@version 2.10.4
//@update-url https://raw.githubusercontent.com/daelar99-rgb/char_wiki/main/char_wiki.js
//@link https://github.com/daelar99-rgb/char_wiki 깃허브
//@arg source_limit int 한 번에 모델에 보낼 원문 최대 글자 수 (비우면 40000)

(async () => {
    'use strict';
    const api = typeof Risuai !== 'undefined' ? Risuai : risuai;
    const LOG = '[챠위키]';
    const VERSION = '2.10.4';
    const DEV_URL = 'https://github.com/daelar99-rgb';
    const UPDATE_URL = 'https://raw.githubusercontent.com/daelar99-rgb/char_wiki/main/char_wiki.js';
    const GH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
    const STORE_PREFIX = 'wiki:';
    const doc = document;

    const PALETTE = ['#3c6ea5', '#d29a2c', '#b8394a', '#8a6a3a', '#d8623a', '#2b7a4b', '#00897b', '#5b4a8a', '#455a64'];

    const SOURCES = [
        { id: 'desc', label: '봇 설명', note: '설명 · 성격 · 시나리오', on: true },
        { id: 'note', label: '글로벌 노트', note: '이 캐릭터의 글로벌 노트', on: false },
        { id: 'first', label: '첫 메시지', note: '첫 메시지와 대체 첫 메시지', on: false },
        { id: 'charLore', label: '캐릭터 로어북', note: '봇에 들어 있는 로어북', on: true },
        { id: 'chatLore', label: '채팅 로어북', note: '이 채팅에만 있는 로어북', on: false },
        { id: 'moduleLore', label: '모듈 로어북', note: '켜 둔 모듈의 로어북', on: false },
    ];

    async function argInt(key, fallback) {
        try {
            const v = Number(await api.getArgument(key));
            return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
        } catch {
            return fallback;
        }
    }

    function cleanText(text, charName, userName = '유저') {
        return String(text ?? '')
            .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
            .replace(/\{\{\/\/[\s\S]*?\}\}/g, '')
            .replace(/\{\{\s*char\s*\}\}|<char>/gi, charName)
            .replace(/\{\{\s*user\s*\}\}|<user>/gi, userName)
            .replace(/^@@.*$/gm, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?[a-z][^>]*>/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function loreTitle(entry) {
        return String(entry.comment || entry.key || '이름 없는 항목').trim().slice(0, 80);
    }
    const loreKeys = entry => [entry.key, entry.secondkey].filter(Boolean).join(', ');

    async function collectSources(char, picked) {
        const name = char.name || '봇';
        const out = [];
        const add = (kind, title, text, keys = '') => {
            const body = cleanText(text, name);
            if (body) out.push({ kind, title, keys, text: body });
        };
        if (picked.desc) {
            add('desc', '봇 설명', char.desc);
            add('desc', '성격', char.personality);
            add('desc', '시나리오', char.scenario);
        }
        if (picked.note) add('desc', '글로벌 노트', char.replaceGlobalNote);
        if (picked.first) {
            add('first', '첫 메시지', char.firstMessage);
            (char.alternateGreetings ?? []).forEach((g, i) => add('first', `대체 첫 메시지 ${i + 1}`, g));
        }
        const usable = e => e && e.mode !== 'folder' && String(e.content ?? '').trim();
        const charLore = (char.globalLore ?? []).filter(usable);
        const chatLore = (char.chats?.[char.chatPage]?.localLore ?? []).filter(usable);
        if (picked.charLore) charLore.forEach(e => add('lore', loreTitle(e), e.content, loreKeys(e)));
        if (picked.chatLore) chatLore.forEach(e => add('lore', loreTitle(e), e.content, loreKeys(e)));
        if (picked.moduleLore) {
            try {
                const all = await api.getCurrentLorebookEntries();
                const skip = (char.globalLore ?? []).length + (char.chats?.[char.chatPage]?.localLore ?? []).length;
                all.slice(skip).filter(usable).forEach(e => add('lore', '모듈 · ' + loreTitle(e), e.content, loreKeys(e)));
            } catch (error) {
                console.warn(LOG, 'module lore', error);
            }
        }
        return out;
    }

    const NO_SOURCE = '고른 출처에 읽을 내용이 없습니다. 출처 설정을 확인해 주세요.';
    async function readSources(char, picked) {
        const list = await collectSources(char, picked);
        if (!list.length) throw new Error(NO_SOURCE);
        return list;
    }
    const sourceLimit = () => argInt('source_limit', 40000);

    function formatSource(s) {
        const head = s.kind === 'lore' ? `### 로어북: ${s.title}` : `### ${s.title}`;
        return head + (s.keys ? `\n(키워드: ${s.keys})` : '') + '\n' + s.text;
    }

    function packSources(list, limit) {
        let text = '';
        let dropped = 0;
        for (const s of list) {
            const piece = formatSource(s) + '\n\n';
            if (text.length + piece.length > limit) {
                const room = limit - text.length;
                if (room > 400) text += piece.slice(0, room) + '…(잘림)\n\n';
                dropped++;
                continue;
            }
            text += piece;
        }
        return { text: text.trim(), dropped };
    }

    function rosterSources(list, limit) {
        const desc = list.filter(s => s.kind !== 'lore');
        const lore = list.filter(s => s.kind === 'lore');
        const descPack = packSources(desc, Math.floor(limit * 0.6));
        const rest = limit - descPack.text.length;
        const per = Math.max(300, Math.floor(rest / Math.max(1, lore.length)));
        const short = lore.map(s => ({ ...s, text: s.text.length > per ? s.text.slice(0, per) + '…' : s.text }));
        const lorePack = packSources(short, rest);
        return { text: [descPack.text, lorePack.text].filter(Boolean).join('\n\n'), dropped: descPack.dropped + lorePack.dropped };
    }

    function mentions(s, names) {
        const hay = (s.title + '\n' + s.keys + '\n' + s.text).toLowerCase();
        return names.some(n => n && n.length >= 1 && hay.includes(n.toLowerCase()));
    }

    function personSources(list, person, limit) {
        return groupSources(list, [person], limit);
    }

    function groupSources(list, group, limit) {
        const names = group.flatMap(p => [p.name, ...(p.aliases ?? [])]).map(n => String(n).trim()).filter(Boolean);
        const hit = list.filter(s => s.kind === 'lore' && mentions(s, names));
        const titled = hit.filter(s => names.some(n => (s.title + s.keys).includes(n)));
        const other = hit.filter(s => !titled.includes(s));
        const base = list.filter(s => s.kind !== 'lore');
        return packSources([...titled, ...base, ...other], limit);
    }

    async function readStream(stream) {
        const reader = stream.getReader();
        let last = '';
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (typeof value === 'string') last += value;
            else if (value && typeof value === 'object') last = Object.values(value).join('');
        }
        return last;
    }

    function stopError() {
        return Object.assign(new Error('중단했습니다.'), { isStop: true });
    }

    function startBusy(key, label, total) {
        const busy = { key, label, done: 0, total, stop: false };
        busy.halt = new Promise(resolve => { busy.onStop = resolve; });
        return busy;
    }

    function stopBusy(busy) {
        busy.stop = true;
        busy.label = '중단하는 중';
        busy.onStop();
        render();
    }

    async function askModel(system, user) {
        const busy = st.busy;
        if (busy?.stop) throw stopError();
        const work = requestModel(system, user);
        work.catch(() => {});
        const text = await (busy ? Promise.race([work, busy.halt]) : work);
        if (busy?.stop) throw stopError();
        return text;
    }

    async function requestModel(system, user) {
        const res = await api.runLLMModel({
            mode: st.model === 'submodel' ? 'submodel' : 'model',
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            allowPlugins: true,
        });
        if (!res) throw new Error('모델이 아무것도 돌려주지 않았습니다.');
        if (res.type === 'fail') throw new Error(String(res.result || '모델 요청이 실패했습니다.'));
        if (res.type === 'streaming') return readStream(res.result);
        if (res.type === 'multiline') return res.result.map(x => x[1]).join('\n');
        return String(res.result ?? '');
    }

    function parseJson(text) {
        let s = String(text).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) s = fence[1];
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a < 0 || b <= a) throw new Error('응답에서 JSON을 찾지 못했습니다.');
        s = s.slice(a, b + 1);
        try {
            return JSON.parse(s);
        } catch {
            const fixed = s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
            return JSON.parse(fixed);
        }
    }

    const RETRIES = 3;

    async function retryPause(busy, ms) {
        const wait = new Promise(resolve => setTimeout(resolve, ms));
        await (busy ? Promise.race([wait, busy.halt]) : wait);
        if (busy?.stop) throw stopError();
    }

    async function askJson(system, user) {
        const busy = st.busy;
        const label = busy?.label;
        let lastError;
        let parseFailed = false;
        try {
            for (let attempt = 0; attempt <= RETRIES; attempt++) {
                if (attempt) {
                    if (busy) {
                        busy.label = `${label} (다시 시도 ${attempt}/${RETRIES})`;
                        render();
                    }
                    await retryPause(busy, 1000 * attempt);
                }
                let text;
                try {
                    text = await askModel(system, parseFailed ? user + '\n\n[주의] 앞선 응답이 올바른 JSON이 아니었다. 설명 없이 JSON 객체 하나만 출력하라.' : user);
                } catch (error) {
                    if (error?.isStop || busy?.stop) throw error?.isStop ? error : stopError();
                    lastError = error;
                    console.warn(LOG, `model (${attempt + 1}/${RETRIES + 1})`, error);
                    continue;
                }
                try {
                    return parseJson(text);
                } catch (error) {
                    if (busy?.stop) throw stopError();
                    error.isParse = true;
                    lastError = error;
                    parseFailed = true;
                    console.warn(LOG, `JSON parse (${attempt + 1}/${RETRIES + 1})`, error, text.slice(0, 500));
                }
            }
            throw lastError;
        } finally {
            if (busy && !busy.stop && label !== undefined && busy.label.startsWith(label + ' (다시 시도')) {
                busy.label = label;
            }
        }
    }

    const SYSTEM = [
        '너는 나무위키 문서를 쓰는 편집자다. 사용자가 주는 [원문]은 롤플레이 봇의 설정(봇 설명 · 로어북)이다.',
        '규칙:',
        '- [원문]에 적힌 내용만 근거로 쓴다. 원문에 없는 사실 · 수치 · 과거사는 지어내지 않는다. 모르면 그 칸을 빼거나 "불명"이라 쓴다.',
        '- 문체는 나무위키처럼 건조한 평서문(~다)으로 쓴다. 롤플레이 지시문 · 시스템 지시 · 출력 형식 규칙은 문서에 옮기지 않는다.',
        '- 설정이 아니라 봇 운영 지시("~하게 묘사하라" 등)는 무시한다.',
        '- 출력은 설명이나 코드 펜스 없이 JSON 객체 하나뿐이다. 문자열 안의 큰따옴표는 \\" 로 쓴다.',
    ].join('\n');

    const SYSTEM_EN = [
        '',
        '출력 언어 (위 문체 규칙보다 우선한다):',
        '- JSON 안의 글(wikiName, summary, categories, profileSections, role, original, nickname, quote, infobox 의 label · value, 문단 title · paragraphs · items)은 모두 자연스러운 영어로 쓴다. 문체는 영어 위키 백과처럼 건조한 평서문이다. [원문]이 한국어여도 영어로 옮겨 쓴다.',
        '- 단, 인물의 name · aliases · 문서 title, 그리고 [[ ]] 의 이름은 [원문]에 적힌 표기 그대로 둔다. 번역하거나 로마자로 바꾸지 않는다.',
        '- 영어 문장 안에서 인물을 가리킬 때는 [[원문 이름|영어 표기]] 꼴로 쓴다. 예: [[세라|Sera]]. original 에는 그 인물 이름의 영어 표기를 쓴다.',
        '- 인물 문서의 문단 기본 틀과 순서: Overview, Appearance, Personality, Background, Abilities, Relationships, Preferences, Secrets, Trivia. 이 위키의 공통 목차가 주어지면 그것을 따른다.',
        '- 대문(세계관) 문서의 문단 기본 틀과 순서: Overview, History, Geography, Factions, Systems, Glossary, Trivia. items 는 "Name: description" 꼴로 쓴다.',
        '- Relationships 의 items 는 "[[상대 원문 이름|영어 표기]]: 관계 설명", Preferences 의 items 는 "Likes: …", "Dislikes: …" 꼴로 쓴다.',
        '- 모르는 값은 "불명" 대신 "Unknown" 으로 쓴다. quote 는 원문 대사를 영어로 옮긴다.',
    ].join('\n');

    const SYSTEM_KO = '- [원문]이 한국어가 아니어도 문서는 한국어로 쓴다. quote(대사)도 한국어로 옮겨 쓴다. profileSections 와 문단 제목도 한국어로 쓴다. 인물 이름 표기는 원문 그대로 둔다.';

    const systemPrompt = () => st.lang === 'en' ? SYSTEM + '\n' + SYSTEM_EN : SYSTEM + '\n' + SYSTEM_KO;

    function extraBlock() {
        const t = String(st.extra ?? '').trim();
        return t ? `[추가 지시]
${t}

` : '';
    }

    const PROFILE_DEFAULT = '개요, 외모, 성격, 배경, 능력, 인간관계, 취향, 비밀, 여담';
    const profileOf = wiki => wiki?.profile?.length && wiki.profileLang === st.lang ? wiki.profile.join(', ') : '';

    function rosterPrompt(botName, source) {
        return `${extraBlock()}[원문] (봇 이름: ${botName})
${source}

[할 일]
원문에 이름이 나오는 등장인물을 비중이 큰 순서로 모두 고르고, 이 세계를 소개하는 대문 정보를 만든다.
- 로어북 항목 · 설명에 따로 설정이 적힌 인물은 하나도 빠뜨리지 않는다. 원문을 끝까지 훑고 목록을 마무리한다.
- 유저(플레이어)가 맡는 인물은 넣지 않는다. 이름 없이 직함만 나오는 단역도 넣지 않는다.
- 같은 사람의 다른 이름 · 별명은 aliases 에 모은다.
- id: 그 인물의 영어 이름. 원문에 영어(로마자) 표기가 적혀 있으면 그 표기를 그대로 쓰고, 없으면 로마자로 옮긴다. 띄어쓰기는 _ 로 바꾼다(예: 강우석 → Kang_Woo-seok). 인물마다 달라야 한다.
${st.lang === 'en'
        ? '- 대표 이름이 영어(로마자) 표기가 아니면, 그 이름의 영어 표기 하나를 aliases 에 넣는다(예: 강서린 → Kang Seorin). 화면에 이름을 보일 때 쓴다.'
        : '- 대표 이름이 한국어 표기가 아니면, 그 이름의 한국어 표기 하나를 aliases 에 넣는다(예: Kang Seorin → 강서린, 佐藤 → 사토). 화면에 이름을 보일 때 쓴다.'}
- isSpoiler: 원문에서 정체나 존재 자체가 숨겨진 비밀 인물이면 true.
- profileSections: 모든 인물 문서가 함께 쓸 목차(문단 제목 차례)를 이 세계에 맞게 하나 정한다. 인물 문서들의 목차가 서로 같아지도록 쓰는 틀이다.
  - 기본 틀(${PROFILE_DEFAULT})에서 시작해, 이 세계 인물들에게 맞지 않는 항목은 빼고, 여러 인물에게 공통으로 설정된 내용이 있으면 알맞은 제목으로 1~2개 더한다(예: 병원이면 진료 방식, 학원이면 학교생활, 판타지면 전투 방식).
  - 개요를 맨 앞에, 여담을 맨 뒤에 둔다. 5~9개.

[출력 JSON 형식]
{
  "wikiName": "이 세계 · 작품의 이름 (원문에 없으면 봇 이름)",
  "summary": ["세계관 소개 문단 1", "문단 2"],
  "categories": ["분류1", "분류2"],
  "profileSections": ["${st.lang === 'en' ? 'Overview' : '개요'}", "…", "${st.lang === 'en' ? 'Trivia' : '여담'}"],
  "people": [
    { "id": "English_Name", "name": "대표 이름", "aliases": ["별명"], "role": "한 줄 소개 (소속 · 역할)", "isSpoiler": false }
  ]
}`;
    }

    const familyRule = en => en
        ? '- Family goes in ONE infobox row: label "Family", value "Father: [[name]]" (relation: name). For several relatives, put one per line separated by \\n inside the value. Names not in the wiki are written without [[ ]].'
        : '- 가족은 정보 상자 한 줄에 모은다: label 은 "가족", value 는 "아버지: [[이름]]" 꼴(관계: 이름). 가족이 여럿이면 value 안에서 \\n 으로 줄을 나눠 한 사람씩 쓴다. 위키에 없는 사람은 [[ ]] 없이 이름만 쓴다.';

    const bodyRule = en => en
        ? '- Body measurements go in ONE infobox row: label "Body", value on ONE line like "Height: 165cm / Weight: 48kg / Bust: C cup / Other: waist 58cm · feet 230mm" in the order Height, Weight, Bust, Other, items joined with " / " (no line breaks). Only write items the source states; drop a missing item entirely (never guess or invent numbers). "Other" joins the remaining measurements (waist, hips, build, foot size …) with " · ".'
        : '- 신체 정보는 정보 상자 한 줄에 모은다: label 은 "신체", value 는 "키: 165cm / 몸무게: 48kg / 가슴: C컵 / 기타: 허리 58cm · 발 230mm" 처럼 키 · 몸무게 · 가슴 · 기타 차례로 「 / 」로 이어 한 줄에 쓴다(줄을 나누지 않는다). 원문에 적힌 항목만 쓰고, 없는 항목은 줄째 뺀다(짐작하거나 숫자를 지어내지 않는다). 기타에는 허리 · 엉덩이 · 체형 · 발 크기 같은 나머지 치수를 「 · 」로 이어 쓴다.';

    const MARKUP_RULES = `  - 보충 설명은 ((각주 내용)) 으로 쓴다. 문서 전체에 0~4개.
  - 핵심 단어나 중요한 문장은 **굵게** 감싼다. 문단마다 1~3곳만, 이름 링크 [[ ]] 와 겹치지 않게 쓴다.
  - 스포일러: 숨겨진 정체 · 반전 · 과거의 비밀 · 결말 · 원문이 "비밀" · "숨긴다" · "모른다"고 한 내용은 반드시 가린다.
    문단 전체가 스포일러면 그 section 에 "spoiler": true, 문장 일부면 ||가릴 내용|| 으로 감싼다. "spoiler": true 인 문단 안에서는 ||…|| 를 따로 쓰지 않는다.
    정보 상자 줄이 스포일러면 그 줄에 "spoiler": true.`;

    function userPrompt(botName, roster, user, persona, chat) {
        const names = roster.map(p => p.name).join(', ');
        const en = st.lang === 'en';
        return `${extraBlock()}[유저 문서] 이 문서의 주인공은 롤플레이에서 유저(플레이어)가 연기하는 인물 「${user.name}」이다.

[페르소나] (유저가 정한 이 인물의 설정)
${persona || '(없음)'}

[채팅 기록] (최근 메시지 최대 ${st.userChat}개. 봇 이름: ${botName}. 「${user.name}:」 줄은 유저가 쓴 말과 행동, 「${botName}:」 줄은 봇이 쓴 서술과 다른 인물의 반응)
${chat || '(없음)'}

[위키에 있는 인물] ${names}

[할 일]
「${user.name}」의 나무위키 문서 하나를 쓴다.
- 근거는 [페르소나]와 [채팅 기록]뿐이다. 페르소나에 적힌 설정, 채팅에서 이 인물이 한 말 · 행동, 다른 인물이 이 인물에게 보인 반응으로 쓴다. 둘 다에 없는 것은 지어내지 않는다.
- 채팅의 「${user.name}:」 줄은 1인칭이거나 짧은 지시일 수 있다. 문서에는 3인칭 서술로 옮긴다. 봇에게 하는 OOC · 시스템 요청은 문서에 옮기지 않는다.
- 페르소나와 채팅이 어긋나면 채팅에서 실제로 보인 모습을 쓰고, 차이를 여담에 한 줄로 적는다.
- "title" 은 「${user.name}」 그대로 쓴다. categories 에 "유저" · "플레이어" · "가상 인물" 같은 분류는 넣지 않는다.
- 정보 상자(infobox)에는 페르소나와 채팅에 있는 것만 넣는다. 예: 본명 · 나이 · 성별 · 신체 · 소속 · 직업 · 종족 · 가족. 4~10줄.
${familyRule(en)}
${bodyRule(en)}
- 문단(sections)은 내용이 있는 것만 쓴다. 기본 틀과 순서: 개요, 외모, 성격, 작중 행적, 인간관계, 여담.
  - 작중 행적은 채팅에서 일어난 일을 시간 순서로 정리한다. 2~5문단.
  - 인간관계 문단을 쓰면 items 에 "[[상대 이름]]: 관계 설명" 꼴로 쓴다. 채팅에서 실제로 엮인 사람만 쓴다.
  - 나머지는 paragraphs 에 문단으로 쓴다. 문단 하나는 2~4문장.
- 본문 표기:
  - 위 인물 목록에 있는 사람 이름이 처음 나올 때 [[이름]] 으로 감싼다.
${MARKUP_RULES}
- quote 는 채팅에서 「${user.name}」이 한 말 중 성격이 잘 드러나는 한 줄. ${en ? '영어로' : '한국어로'} 옮겨 쓴다. 없으면 빈 문자열.

[출력 JSON 형식]
{
  "title": "${user.name}",
  "original": "",
  "nickname": "",
  "categories": ["분류1"],
  "quote": "",
  "infobox": [ { "label": "${en ? 'Age' : '나이'}", "value": "${en ? '17' : '17세'}", "spoiler": false } ],
  "sections": [
    { "title": "${en ? 'Overview' : '개요'}", "paragraphs": ["…"], "items": [], "spoiler": false }
  ]
}`;
    }

    function articlePrompt(botName, roster, group, source, profile = '') {
        const names = roster.map(p => p.name).join(', ');
        const en = st.lang === 'en';
        const who = group.map(p => `- 「${p.name}」${p.aliases?.length ? ` (다른 이름: ${p.aliases.join(', ')})` : ''}`).join('\n');
        const user = roster.find(p => p.isUser);
        return `${extraBlock()}[원문] (봇 이름: ${botName})
${source}

[위키에 있는 인물] ${names}

[할 일]
아래 ${group.length}명의 나무위키 문서를 한 명씩 따로 쓴다.
${who}
- ${group.length}명 모두 빠짐없이 articles 에 넣는다. 각 문서의 "title" 은 위 「」 안의 이름을 그대로 쓴다.
- 한 사람의 내용을 다른 사람 문서에 섞지 않는다.
아래 규칙은 문서마다 똑같이 지킨다.
- categories 에는 소속 · 직업 · 종족 · 작품 같은 분류만 쓴다. "가상 인물" · "가공인물" 처럼 허구의 인물이라는 분류는 넣지 않는다.
- 정보 상자(infobox)에는 원문에 있는 것만 넣는다. 예: 본명 · 나이 · 성별 · 생일 · 신체 · 소속 · 직업 · 종족 · 가족. 6~12줄.
${familyRule(en)}
${bodyRule(en)}
${profile
        ? `- 문단(sections)은 원문에 내용이 있는 것만 쓴다. 이 위키의 공통 목차와 순서: ${profile}.
  - 모든 인물 문서가 이 목차를 함께 쓴다. 문단 제목은 위에 적힌 그대로 쓰고, 내용이 없는 항목만 뺀다.`
        : `- 문단(sections)은 원문에 내용이 있는 것만 쓴다. 기본 틀과 순서: ${PROFILE_DEFAULT}.`}
  - 틀에 맞지 않는 내용(예: 작중 행적, 전투 방식, 소지품, 어록, 소속 조직)이 원문에 충분히 있으면 알맞은 제목으로 문단을 새로 만들어 어울리는 자리에 넣는다. 한두 문장뿐이면 가까운 문단이나 여담에 합친다.
  - 인간관계 문단을 쓰면 items 에 "[[상대 이름]]: 관계 설명" 꼴로 쓴다.
  - 취향 문단을 쓰면 items 에 "좋아하는 것: …", "싫어하는 것: …" 꼴로 쓴다.
  - 나머지는 paragraphs 에 문단으로 쓴다. 문단 하나는 2~4문장.
- 본문 표기:
  - 위 인물 목록에 있는 사람 이름이 처음 나올 때 [[이름]] 으로 감싼다.${user ? ` 원문의 「유저」는 [[${user.name}]] 이다.` : ''}
${MARKUP_RULES}
- quote 는 원문에 있는 그 인물의 대사 중 성격이 잘 드러나는 한 줄. ${en ? '영어로' : '한국어로'} 옮겨 쓴다(원문이 이미 그 언어면 그대로). 원문에 대사가 없으면 빈 문자열.

[출력 JSON 형식]
{
  "articles": [
    {
      "title": "${group[0].name}",
      "original": "원어 · 영문 표기 (없으면 빈 문자열)",
      "nickname": "대표 별명 (없으면 빈 문자열)",
      "categories": ["분류1", "분류2"],
      "quote": "",
      "infobox": [ { "label": "${en ? 'Age' : '나이'}", "value": "${en ? '17' : '17세'}", "spoiler": false } ],
      "sections": [
        { "title": "${en ? 'Overview' : '개요'}", "paragraphs": ["…"], "items": [], "spoiler": false }
      ]
    }
  ]
}`;
    }

    function worldPrompt(botName, roster, source) {
        const en = st.lang === 'en';
        const names = roster.map(p => p.name).join(', ');
        const hidden = roster.filter(p => p.isSpoiler).map(p => p.name).join(', ');
        return `${extraBlock()}[원문] (봇 이름: ${botName})
${source}

[위키에 있는 인물] ${names}
${hidden ? `[스포일러 인물] ${hidden}
` : ''}
[할 일]
이 세계를 소개하는 대문 문서를 나무위키의 「세계관」 문서처럼 자세히 쓴다. 인물 한 명 한 명의 소개는 인물 문서에 따로 있으므로, 여기서는 세계 자체를 다룬다.
- 문단(sections)은 원문에 내용이 있는 것만 쓴다. 기본 틀과 순서: 개요, 배경 · 역사, 지리 · 장소, 세력 · 조직, 체계(마법 · 기술 · 제도처럼 이 세계가 돌아가는 규칙), 용어, 여담.
  - 틀에 맞지 않는 내용(예: 종족, 사건, 학원 생활, 경제)이 원문에 충분히 있으면 알맞은 제목으로 문단을 새로 만들어 어울리는 자리에 넣는다.
  - 개요는 이 세계가 어떤 곳이고 이야기가 어디서 시작하는지 2~3문단으로 쓴다.
  - 나머지 문단은 원문에 있는 설정을 빠뜨리지 말고 구체적으로 옮긴다. 문단 하나는 2~4문장이다.
  - 장소 · 세력 · 용어처럼 이름이 여럿 나열되는 내용은 items 에 "이름: 설명" 꼴로 쓴다.
- 본문 표기:
  - 위 인물 목록에 있는 사람 이름이 처음 나올 때 [[이름]] 으로 감싼다.
  - 보충 설명은 ((각주 내용)) 으로 쓴다. 문서 전체에 0~4개.
  - 핵심 단어나 중요한 문장은 **굵게** 감싼다. 문단마다 1~3곳만, 이름 링크 [[ ]] 와 겹치지 않게 쓴다.
  - 스포일러: 숨겨진 진실 · 반전 · 비밀 · 결말은 반드시 가린다. [스포일러 인물]의 이름과 그 인물에 관한 사실은 "spoiler": true 인 문단이나 ||…|| 안에서만 쓴다.
    문단 전체가 스포일러면 그 section 에 "spoiler": true, 문장 일부면 ||가릴 내용|| 으로 감싼다.

[출력 JSON 형식]
{
  "sections": [
    { "title": "${en ? 'Overview' : '개요'}", "paragraphs": ["…"], "items": [], "spoiler": false },
    { "title": "${en ? 'Geography' : '지리 · 장소'}", "paragraphs": ["…"], "items": ["${en ? 'Name: description' : '이름: 설명'}"], "spoiler": false }
  ]
}`;
    }

    const charKey = char => STORE_PREFIX + (char?.chaId || char?.name || 'unknown');

    async function currentChar() {
        const index = await api.getCurrentCharacterIndex();
        return index >= 0 ? await api.getCharacterFromIndex(index) : null;
    }

    const wikiCache = new Map();

    async function loadWiki(char) {
        const key = charKey(char);
        if (wikiCache.has(key)) return wikiCache.get(key);
        try {
            let v = await api.pluginStorage.getItem(key);
            v = v ? (typeof v === 'string' ? JSON.parse(v) : v) : null;
            if (Array.isArray(v?.people)) fixIds(v.people.filter(p => !p.isUser));
            wikiCache.set(key, v);
            return v;
        } catch (error) {
            console.warn(LOG, 'load', error);
            return null;
        }
    }

    async function saveWiki(key, wiki) {
        wikiCache.set(key, wiki);
        try {
            await api.pluginStorage.setItem(key, JSON.parse(JSON.stringify(wiki)));
        } catch (error) {
            console.warn(LOG, 'save', error);
        }
    }

    async function loadPrefs() {
        const get = k => api.pluginStorage.getItem(k).catch(() => null);
        const [b, l, f, m, x, u] = await Promise.all(['wiki_batch', 'wiki_lang', 'wiki_font', 'wiki_model', 'wiki_extra', 'wiki_userchat'].map(get));
        st.batch = BATCHES.includes(Number(b)) ? Number(b) : 1;
        st.lang = LANGS.some(y => y[0] === l) ? l : 'ko';
        st.font = FONTS.some(y => y[0] === f) ? f : 'm';
        st.model = m === 'model' ? 'model' : 'submodel';
        st.extra = typeof x === 'string' ? x : '';
        st.userChat = u == null ? USER_CHAT_DEF : userChatNum(u);
    }

    let prefsJob = null;
    function loadSettingsOnce() {
        prefsJob ??= Promise.all([loadPicked().then(v => { st.picked = v; }), loadPrefs()]).catch(error => {
            prefsJob = null;
            console.warn(LOG, 'prefs', error);
        });
        return prefsJob;
    }

    const BATCHES = [1, 3, 5, 10];
    const USER_CHAT_DEF = 100, USER_CHAT_TOP = 10000;
    const userChatNum = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(n, USER_CHAT_TOP) : USER_CHAT_DEF; };
    const LANGS = [['ko', '한국어'], ['en', 'English']];
    const FONTS = [['s', '작게', 0.9], ['m', '보통', 1], ['l', '크게', 1.15], ['xl', '아주 크게', 1.3]];
    const modelLabel = () => st.model === 'submodel' ? '보조 모델' : '메인 모델';

    async function loadPicked() {
        const base = Object.fromEntries(SOURCES.map(s => [s.id, s.on]));
        try {
            let v = await api.pluginStorage.getItem('wiki_sources');
            if (typeof v === 'string') v = JSON.parse(v);
            if (v && typeof v === 'object') Object.assign(base, v);
        } catch {}
        return base;
    }

    const st = {
        char: null,
        key: '',
        wiki: null,
        sel: '__main',
        picked: {},
        busy: null,
        status: '',
        error: '',
        revealAll: false,
        model: 'submodel',
        batch: 1,
        font: 'm',
        inputBtn: true,
        lang: 'ko',
        extra: '',
        userChat: USER_CHAT_DEF,
        portraits: new Map(),
        thumbs: new Map(),
    };

    const USER_MIN = 3;
    const blankUser = () => ({ name: '유저', aliases: ['유저'], role: '유저', isUser: true, article: null, error: '' });
    function ensureUser(wiki) {
        if (wiki && !wiki.people.some(p => p.isUser)) wiki.people.unshift(blankUser());
        return wiki;
    }
    const userInputs = char => (char?.chats?.[char.chatPage]?.message ?? []).filter(m => m?.role === 'user' && String(m.data ?? '').trim()).length;

    const STOP_LEFT = '중단했습니다. 남은 문서는 작성 수 옆의 「이어 쓰기」로 이어 쓸 수 있습니다.';

    async function generateAll(fresh) {
        if (st.busy) return;
        const char = st.char;
        if (!char) return;
        const key = st.key;
        const busy = startBusy(key, '원문을 읽는 중', 0);
        busy.span = [0, 0.04];
        let wiki = null;
        st.busy = busy;
        st.error = '';
        if (fresh) {
            st.wiki = null;
            st.sel = '__main';
            clearFaces();
            wikiCache.delete(key);
        }
        render();
        try {
            if (fresh) await api.pluginStorage.removeItem(key).catch(error => console.warn(LOG, 'remove', error));
            const limit = await sourceLimit();
            const list = await readSources(char, st.picked);
            busy.label = '인물 목록을 뽑는 중';
            busy.span = [0.04, 0.2];
            render();
            const pack = rosterSources(list, limit);
            const r = await askJson(systemPrompt(), rosterPrompt(char.name, pack.text));
            const found = (Array.isArray(r.people) ? r.people : []).filter(p => p && String(p.name ?? '').trim());
            const people = found
                .map(p => ({
                    id: String(p.id ?? '').trim(),
                    name: String(p.name).trim(),
                    aliases: (Array.isArray(p.aliases) ? p.aliases : []).map(String).filter(Boolean),
                    role: String(p.role ?? ''),
                    isSpoiler: !!p.isSpoiler,
                    article: null,
                    error: '',
                }));
            fixIds(people);
            if (people.length) {
                busy.label = '대표 사진을 고르는 중';
                busy.span = [0.2, 0.24];
                render();
                try {
                    await pickFaces(char, people);
                } catch (error) {
                    if (error?.isStop) throw error;
                    console.warn(LOG, 'faces', error);
                }
            }
            people.unshift(blankUser());
            wiki = {
                v: 1,
                lang: st.lang,
                botName: char.name,
                wikiName: String(r.wikiName || char.name),
                summary: toList(r.summary),
                categories: toList(r.categories),
                profile: toList(r.profileSections).slice(0, 12),
                profileLang: st.lang,
                people,
                sources: { ...st.picked },
                dropped: pack.dropped,
                updatedAt: Date.now(),
            };
            if (st.key === key) {
                st.wiki = wiki;
                st.sel = '__main';
                clearFaces();
            }
            await saveWiki(key, wiki);
            busy.span = people.length > 1 ? [0.24, 0.32] : [0.24, 1];
            await writeWorld(char, wiki, pack.text, busy);
            await saveWiki(key, wiki);
            if (st.key === key && wiki.world?.length) {
                ui.tab = 'wiki';
                select('__main', true);
            }
            const cast = people.filter(p => !p.isUser);
            const userDoc = userInputs(char) >= USER_MIN;
            busy.total = cast.length + (userDoc ? 1 : 0);
            busy.base = 0.32;
            busy.span = null;
            await writeCast(char, key, wiki, cast, list, limit, busy);
            let userMsg = '';
            if (userDoc && !busy.stop) {
                busy.step = 1;
                try {
                    const { user, persona } = await fillUser(char, wiki, busy, false);
                    userMsg = user.error ? ' 유저 문서는 쓰지 못했습니다.' : persona ? ` 유저 「${user.name}」 문서도 썼습니다.` : ' 유저 문서는 페르소나를 읽지 못해 채팅 대화만으로 썼습니다.';
                } catch (error) {
                    if (error?.isStop) throw error;
                    console.warn(LOG, 'user', error);
                    userMsg = ' 유저 문서는 쓰지 못했습니다: ' + errText(error);
                }
                busy.done += 1;
                wiki.updatedAt = Date.now();
                await saveWiki(key, wiki);
            }
            st.status = busy.stop ? STOP_LEFT : (cast.length ? `위키를 만들었습니다. 인물 ${cast.length}명.` : '원문에 인물이 없어 세계관 문서만 만들었습니다.') + userMsg;
        } catch (error) {
            if (error?.isStop) {
                if (wiki) await saveWiki(key, wiki);
                st.status = wiki ? STOP_LEFT : '중단했습니다.';
            } else {
                console.error(LOG, error);
                st.error = errText(error);
            }
        } finally {
            st.busy = null;
            render();
        }
    }

    async function writeCast(char, key, wiki, cast, list, limit, busy) {
        const size = st.batch;
        for (let i = 0; i < cast.length; i += size) {
            if (busy.stop) break;
            const group = cast.slice(i, i + size);
            busy.label = group.length > 1 ? `「${group[0].name}」 외 ${group.length - 1}명의 문서를 쓰는 중` : `「${group[0].name}」 문서를 쓰는 중`;
            busy.step = group.length;
            render();
            await writeGroup(char, wiki, group, list, limit, busy);
            busy.done += group.length;
            wiki.updatedAt = Date.now();
            await saveWiki(key, wiki);
            render();
        }
    }

    async function resumeAll() {
        if (st.busy || !st.wiki || !st.char) return;
        const key = st.key;
        const wiki = st.wiki;
        const char = st.char;
        const left = wiki.people.filter(p => !p.isUser && !p.article);
        if (!left.length) return;
        const busy = startBusy(key, '원문을 읽는 중', left.length);
        st.busy = busy;
        st.error = '';
        st.status = '';
        for (const p of left) p.error = '';
        render();
        try {
            const limit = await sourceLimit();
            const list = await readSources(char, wiki.sources ?? st.picked);
            if (!wiki.world?.length && !wiki.worldError) {
                busy.span = [0, 0.15];
                await writeWorld(char, wiki, rosterSources(list, limit).text, busy);
                await saveWiki(key, wiki);
                busy.base = 0.15;
                busy.span = null;
            }
            await writeCast(char, key, wiki, left, list, limit, busy);
            const miss = left.filter(p => !p.article).length;
            st.status = busy.stop ? STOP_LEFT
                : miss ? `이어 썼습니다. ${left.length - miss}명을 썼고, ${miss}명은 쓰지 못했습니다(빨간 칸).`
                    : `남은 문서 ${left.length}편을 모두 썼습니다.`;
        } catch (error) {
            if (error?.isStop) {
                await saveWiki(key, wiki);
                st.status = STOP_LEFT;
            } else {
                console.error(LOG, error);
                st.error = errText(error);
            }
        } finally {
            st.busy = null;
            render();
        }
    }

    async function writeWorld(char, wiki, source, busy) {
        busy.label = '세계관 문서를 쓰는 중';
        render();
        try {
            const r = await askJson(systemPrompt(), worldPrompt(char.name, wiki.people, source));
            const sections = normalizeSections(Array.isArray(r) ? r : r?.sections);
            if (!sections.length) throw new Error('응답에 세계관 문단이 없습니다.');
            wiki.world = sections;
            wiki.worldLang = st.lang;
            wiki.worldError = '';
        } catch (error) {
            if (error?.isStop) throw error;
            console.error(LOG, 'world', error);
            wiki.worldError = errText(error);
        }
        render();
    }

    async function regenerateMain() {
        if (st.busy || !st.wiki) return;
        const key = st.key;
        const wiki = st.wiki;
        const busy = startBusy(key, '세계관 문서를 다시 쓰는 중', 1);
        st.busy = busy;
        st.error = '';
        render();
        try {
            const limit = await sourceLimit();
            const list = await readSources(st.char, wiki.sources ?? st.picked);
            await writeWorld(st.char, wiki, rosterSources(list, limit).text, busy);
            wiki.updatedAt = Date.now();
            await saveWiki(key, wiki);
        } catch (error) {
            if (error?.isStop) st.status = '중단했습니다.';
            else { console.error(LOG, error); st.error = errText(error); }
        } finally {
            st.busy = null;
            render();
        }
    }

    function errText(error) {
        const msg = String(error?.message || error);
        return /top_?k/i.test(msg) ? msg + ' → 리수 설정 › 채팅 봇 › 파라미터(또는 프로바이더 플러그인의 모델 설정)에서 Top K 를 1 이상으로 바꾸거나 다른 모델을 고르세요.' : msg;
    }

    function articleList(r) {
        if (Array.isArray(r?.articles)) return r.articles.filter(a => a && typeof a === 'object');
        if (Array.isArray(r)) return r.filter(a => a && typeof a === 'object');
        return r && (r.sections || r.infobox) ? [r] : [];
    }

    function findArticle(arr, person) {
        const norm = v => String(v ?? '').replace(/[「」\s]/g, '');
        const names = [person.name, ...(person.aliases ?? [])].map(norm).filter(Boolean);
        return arr.find(a => norm(a.title) === norm(person.name)) || arr.find(a => names.includes(norm(a.title)));
    }

    async function writeArticle(char, wiki, person, list, limit) {
        try {
            const pack = personSources(list, person, limit);
            const arr = articleList(await askJson(systemPrompt(), articlePrompt(char.name, wiki.people, [person], pack.text, profileOf(wiki))));
            const a = findArticle(arr, person) || (arr.length === 1 ? arr[0] : null);
            if (!a) throw new Error('응답에 이 인물의 문서가 없습니다.');
            person.article = normalizeArticle(a, person);
            person.error = '';
        } catch (error) {
            if (error?.isStop) throw error;
            console.error(LOG, person.name, error);
            person.error = errText(error);
        }
    }

    async function writeGroup(char, wiki, group, list, limit, busy) {
        if (group.length === 1) return writeArticle(char, wiki, group[0], list, limit);
        const left = new Set(group);
        try {
            const pack = groupSources(list, group, limit);
            const arr = articleList(await askJson(systemPrompt(), articlePrompt(char.name, wiki.people, group, pack.text, profileOf(wiki))));
            for (const person of group) {
                const a = findArticle(arr, person);
                if (!a) continue;
                person.article = normalizeArticle(a, person);
                person.error = '';
                left.delete(person);
            }
        } catch (error) {
            if (error?.isStop) throw error;
            if (!error?.isParse) {
                console.error(LOG, group.map(p => p.name), error);
                for (const person of group) person.error = errText(error);
                return;
            }
            console.warn(LOG, '묶음 응답이 깨져 한 명씩 다시 쓴다', error);
        }
        if (left.size) console.warn(LOG, '한 명씩 다시 쓰는 인물', [...left].map(p => p.name));
        for (const person of left) {
            if (busy?.stop) break;
            if (busy) busy.label = `「${person.name}」 문서를 따로 쓰는 중`;
            render();
            await writeArticle(char, wiki, person, list, limit);
        }
    }

    async function regenerateOne(name) {
        if (st.busy || !st.wiki) return;
        const person = st.wiki.people.find(p => p.name === name);
        if (!person) return;
        if (person.isUser) return writeUser();
        const key = st.key;
        const wiki = st.wiki;
        const busy = startBusy(key, `「${person.name}」 문서를 다시 쓰는 중`, 1);
        st.busy = busy;
        st.error = '';
        try {
            const fresh = await currentChar();
            if (fresh && charKey(fresh) === key) st.char = fresh;
        } catch {}
        const id = pid(person);
        refinding.set(id, st.portraits.get(id) ?? null);
        render();
        try {
            busy.label = `「${person.name}」 대표 사진을 고르는 중`;
            render();
            try {
                await pickFaces(st.char, [person]);
                await saveWiki(key, wiki);
            } catch (error) {
                if (error?.isStop) throw error;
                console.warn(LOG, 'faces', person.name, error);
            }
            st.portraits.delete(id);
            refinding.delete(id);
            void loadPortrait(person);
            busy.label = `「${person.name}」 문서를 다시 쓰는 중`;
            render();
            const limit = await sourceLimit();
            const list = await readSources(st.char, wiki.sources ?? st.picked);
            await writeArticle(st.char, wiki, person, list, limit);
            wiki.updatedAt = Date.now();
            await saveWiki(key, wiki);
        } catch (error) {
            if (error?.isStop) st.status = '중단했습니다.';
            else { console.error(LOG, error); st.error = errText(error); }
        } finally {
            if (refinding.delete(id)) {
                st.portraits.delete(id);
                void loadPortrait(person);
            }
            st.busy = null;
            render();
        }
    }

    async function getUserPersona(char) {
        try {
            const db = await api.getDatabase(['personas', 'selectedPersona']);
            const list = Array.isArray(db?.personas) ? db.personas : [];
            const bound = char?.chats?.[char.chatPage]?.bindedPersona;
            return (bound && list.find(p => p?.id === bound)) || list[Number(db?.selectedPersona) || 0] || null;
        } catch (error) {
            console.warn(LOG, 'persona', error);
            return null;
        }
    }

    function chatLines(char, userName, max) {
        const msgs = char?.chats?.[char.chatPage]?.message ?? [];
        const out = [];
        for (let i = msgs.length - 1; i >= 0 && out.length < max; i--) {
            const m = msgs[i];
            const body = cleanText(m?.data, char.name, userName);
            if (!body) continue;
            out.push(`${m.role === 'user' ? userName : char.name}: ${body}`);
        }
        return { text: out.reverse().join('\n\n'), users: out.filter(l => l.startsWith(userName + ':')).length };
    }

    async function fillUser(char, wiki, busy, follow) {
        let user = wiki.people.find(p => p.isUser);
        busy.label = '페르소나를 읽는 중 (리수가 데이터베이스 접근 허용을 물을 수 있습니다)';
        render();
        const persona = await getUserPersona(char);
        const name = String(persona?.name ?? '').trim() || user?.name || '유저';
        const limit = await sourceLimit();
        const personaText = cleanText(persona?.personaPrompt, char.name, name).slice(0, limit);
        const chat = chatLines(char, name, st.userChat);
        if (!personaText && !chat.users) throw new Error('페르소나 설명도, 이 채팅에서 유저가 쓴 말도 없어 유저 문서를 쓸 수 없습니다.');
        if (!user) {
            user = { name, aliases: ['유저'], role: '', isUser: true, article: null, error: '' };
            wiki.people.unshift(user);
        }
        st.portraits.delete(pid(user));
        if (st.sel === user.name) st.sel = name;
        user.name = name;
        user.role = persona ? '유저 (페르소나)' : '유저';
        user.icon = typeof persona?.icon === 'string' ? persona.icon : '';
        st.portraits.delete(pid(user));
        if (follow) st.sel = user.name;
        busy.label = `「${name}」(유저) 문서를 쓰는 중`;
        render();
        try {
            const arr = articleList(await askJson(systemPrompt(), userPrompt(char.name, wiki.people, user, personaText, chat.text)));
            const a = findArticle(arr, user) || arr[0];
            if (!a) throw new Error('응답에 유저 문서가 없습니다.');
            user.article = normalizeArticle(a, user);
            user.article.title = user.name;
            user.error = '';
        } catch (error) {
            if (error?.isStop) throw error;
            console.error(LOG, 'user', error);
            user.error = errText(error);
        }
        return { user, persona };
    }

    async function writeUser() {
        if (st.busy || !st.wiki) return;
        const key = st.key;
        const wiki = st.wiki;
        const busy = startBusy(key, '유저 문서를 쓰는 중', 1);
        st.busy = busy;
        st.error = '';
        st.status = '';
        render();
        try {
            let char = st.char;
            try {
                const fresh = await currentChar();
                if (fresh && charKey(fresh) === key) char = st.char = fresh;
            } catch {}
            const inputs = userInputs(char);
            if (inputs < USER_MIN) throw new Error(`이 채팅의 유저 입력이 ${inputs}회입니다. ${USER_MIN}회 이상 채팅한 뒤 유저 문서를 쓸 수 있습니다.`);
            const { user, persona } = await fillUser(char, wiki, busy, true);
            busy.done = 1;
            wiki.updatedAt = Date.now();
            await saveWiki(key, wiki);
            if (!user.error) st.status = `「${user.name}」 문서를 썼습니다.` + (persona ? '' : ' 페르소나를 읽지 못해 채팅 대화만으로 썼습니다.');
        } catch (error) {
            if (error?.isStop) {
                await saveWiki(key, wiki);
                st.status = '중단했습니다.';
            } else { console.error(LOG, error); st.error = errText(error); }
        } finally {
            st.busy = null;
            render();
        }
    }

    function toList(v) {
        if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(Boolean);
        if (typeof v === 'string' && v.trim()) return v.split(/\n+/).map(x => x.trim()).filter(Boolean);
        return [];
    }

    function normalizeSections(v) {
        return (Array.isArray(v) ? v : [])
            .map(s => ({
                title: String(s?.title ?? '').trim(),
                paragraphs: toList(s?.paragraphs ?? s?.body),
                items: toList(s?.items),
                spoiler: !!s?.spoiler || /비밀|스포/.test(String(s?.title ?? '')),
            }))
            .filter(s => s.title && (s.paragraphs.length || s.items.length));
    }

    const BODY_ROW = /^(신체(\s*(사이즈|치수|정보))?|체격|body(\s*(size|measurements?))?|measurements?)$/i;
    const BODY_PARTS = [
        { ko: '키', en: 'Height', re: /^(키|신장|height)$/i },
        { ko: '몸무게', en: 'Weight', re: /^(몸무게|체중|weight)$/i },
        { ko: '가슴', en: 'Bust', re: /^(가슴(\s*(사이즈|둘레|크기))?|바스트|컵(\s*사이즈)?|bust(\s*size)?|chest|cup(\s*size)?)$/i },
    ];
    const BODY_OTHER = /^(기타|other|etc\.?|허리|엉덩이|힙|골반|쓰리\s*사이즈|3\s*사이즈|체형|발(\s*(크기|사이즈))?|신발(\s*사이즈)?|waist|hips?|three\s*sizes?|build|foot(\s*size)?|shoe(\s*size)?)$/i;
    function mergeBody(box) {
        const en = st.lang === 'en';
        const kind = label => BODY_ROW.test(label) ? 'row'
            : BODY_PARTS.findIndex(x => x.re.test(label)) >= 0 ? 'part'
            : BODY_OTHER.test(label) ? 'part' : '';
        for (const spoiler of [false, true]) {
            const idx = box.map((r, i) => r.spoiler === spoiler && kind(r.label) ? i : -1).filter(i => i >= 0);
            if (!idx.length) continue;
            const parts = BODY_PARTS.map(() => []), other = [], loose = [];
            const put = (label, value) => {
                label = label.trim(); value = value.trim();
                if (!value) return;
                const k = BODY_PARTS.findIndex(x => x.re.test(label));
                if (k >= 0) parts[k].push(value);
                else if (/^(기타|other|etc\.?)$/i.test(label)) other.push(value);
                else other.push(`${label} ${value}`);
            };
            for (const i of idx) {
                const r = box[i];
                if (kind(r.label) === 'part') { put(r.label, r.value); continue; }
                const lines = r.value.replace(/\s*(?:[,，;；]|\/)\s*(?=[^,，;；\/:：\n]{1,12}[:：])/g, '\n').split(/\n+/);
                for (const line of lines) {
                    const m = line.match(/^\s*([^:：]{1,12})[:：]\s*(.+)$/);
                    if (m && (BODY_PARTS.some(x => x.re.test(m[1].trim())) || BODY_OTHER.test(m[1].trim()))) put(m[1], m[2]);
                    else if (line.trim()) loose.push(line.trim());
                }
            }
            const out = BODY_PARTS.map((x, k) => parts[k].length ? `${en ? x.en : x.ko}: ${parts[k].join(' · ')}` : '').filter(Boolean);
            if (other.length) out.push(`${en ? 'Other' : '기타'}: ${other.join(' · ')}`);
            out.push(...loose);
            const first = idx[0];
            box[first] = { label: en ? 'Body' : '신체', value: out.join(' / '), spoiler };
            for (const i of idx.slice(1).reverse()) box.splice(i, 1);
        }
    }

    function normalizeArticle(a, person) {
        const box = (Array.isArray(a.infobox) ? a.infobox : [])
            .map(r => Array.isArray(r) ? { label: r[0], value: r[1], spoiler: !!r[2] } : r)
            .filter(r => r && String(r.label ?? '').trim() && String(r.value ?? '').trim())
            .map(r => ({ label: String(r.label).trim(), value: String(r.value).trim(), spoiler: !!r.spoiler }));
        const FAMILY = /^(가족|family)$/i;
        for (const r of box) if (FAMILY.test(r.label)) r.value = r.value.replace(/\s*[,，;；]\s*(?=[^,，;；:：\n]{1,12}[:：])/g, '\n');
        for (let i = box.length - 1; i > 0; i--) {
            if (!FAMILY.test(box[i].label)) continue;
            const first = box.findIndex(r => FAMILY.test(r.label) && r.spoiler === box[i].spoiler);
            if (first < i) {
                box[first].value += '\n' + box[i].value;
                box.splice(i, 1);
            }
        }
        mergeBody(box);
        const sections = normalizeSections(a.sections);
        return {
            title: String(a.title || person.name),
            original: String(a.original ?? ''),
            nickname: String(a.nickname ?? ''),
            categories: toList(a.categories).filter(c => !FICTION_CAT.test(c)),
            quote: String(a.quote ?? '').trim(),
            infobox: box,
            sections,
        };
    }

    const IMG_EXT = /^(?:png|jpe?g|webp|gif|avif|bmp)$/i;

    const LATIN = /^[\x00-\x7f]+$/;
    const toId = n => String(n ?? '').trim().replace(/\s+/g, '_');
    function fixIds(people) {
        const used = new Set();
        for (const p of people) {
            if (p.isUser) continue;
            const latin = [p.id, ...(p.aliases ?? [])].map(toId).find(n => n && /[a-z]/i.test(n) && LATIN.test(n));
            const base = latin || toId(p.name) || 'person';
            let id = base;
            for (let i = 2; used.has(id.toLowerCase()); i++) id = `${base}_${i}`;
            used.add(id.toLowerCase());
            p.id = id;
        }
        return people;
    }
    const pid = p => p.isUser ? 'user:' + p.name : p.id || toId(p.name);

    function assetPool(char) {
        const seen = new Set();
        const out = [];
        for (const x of [...(char.additionalAssets ?? []), ...(char.emotionImages ?? [])]) {
            const name = String(x?.[0] ?? '').trim();
            if (!name || !x[1] || (x[2] && !IMG_EXT.test(x[2]))) continue;
            const low = name.toLowerCase();
            if (seen.has(low)) continue;
            seen.add(low);
            out.push({ name, low, path: x[1] });
        }
        return out;
    }

    const BOT_PIC = '(봇 대표 그림)';

    function facePrompt(char, people, pool) {
        const list = pool.map(a => a.name);
        if (char.image) list.push(BOT_PIC);
        const who = people.map(p => `- id: ${p.id} / 이름: ${p.name}${p.aliases?.length ? ` / 다른 이름: ${p.aliases.join(', ')}` : ''}${p.role ? ` / 소개: ${p.role}` : ''}`).join('\n');
        return `[그림 목록] (봇 「${char.name}」에 등록된 그림 이름 전부, 한 줄에 하나)
${list.join('\n')}

[인물]
${who}

[할 일]
[인물]마다 그 인물을 대표하는 그림 하나를 [그림 목록]에서 고른다.
- 그림 이름은 한 글자도 바꾸지 말고 목록에 적힌 그대로 옮긴다.
- 그 인물의 그림이 여럿이면 기본 표정(default · 기본 · normal · neutral 같은 이름)을 먼저 고르고, 없으면 가장 무난한 표정을 고른다.
- 다른 인물의 그림은 고르지 않는다. 성이 같거나 이름 일부가 겹치는 다른 인물의 그림과 헷갈리지 않는다.
- 이름 없이 표정만 적힌 그림(smile · 기본 같은)은 봇 이름과 같은 인물의 그림으로 본다.${char.image ? `
- ${BOT_PIC} 는 봇 프로필 그림이다. 봇 이름과 같은 인물에게 맞는 그림이 목록에 없을 때만 고른다.` : ''}
- 그 인물의 그림이 목록에 없으면 빈 문자열로 둔다.

[출력 JSON 형식]
{ "faces": { "인물 id": "그림 이름" } }`;
    }

    const FACE_SYSTEM = '너는 롤플레이 봇의 그림 목록에서 등장인물마다 대표 그림 하나를 고르는 도우미다. 설명 없이 JSON 객체 하나만 출력한다.';

    function checkFaces(raw, people, pool, hasBot) {
        const byLow = new Map(pool.map(a => [a.low, a.name]));
        const got = raw && typeof raw === 'object' ? raw : {};
        const keys = new Map(Object.keys(got).flatMap(k => [[k.trim().toLowerCase(), got[k]], [toId(k).toLowerCase(), got[k]]]));
        const out = new Map();
        for (const p of people) {
            const v = String(keys.get(p.id.toLowerCase()) ?? keys.get(p.name.toLowerCase()) ?? '').trim();
            const name = v === BOT_PIC && hasBot ? BOT_PIC : byLow.get(v.toLowerCase()) ?? '';
            out.set(p.id, name);
        }
        return out;
    }

    async function pickFaces(char, people) {
        const cast = people.filter(p => !p.isUser);
        if (!cast.length) return;
        const pool = assetPool(char);
        if (!pool.length && !char.image) {
            for (const p of cast) p.face = '';
            return;
        }
        const r = await askJson(FACE_SYSTEM, facePrompt(char, cast, pool));
        const faces = checkFaces(r?.faces, cast, pool, !!char.image);
        for (const p of cast) p.face = faces.get(p.id) ?? '';
    }

    function toDataUrl(data) {
        if (!data) return Promise.resolve(null);
        if (typeof data === 'string') return Promise.resolve(data.startsWith('data:') || data.startsWith('http') ? data : null);
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
        if (!bytes) return Promise.resolve(null);
        return new Promise(resolve => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(new Blob([bytes], { type: 'image/png' }));
        });
    }

    async function imageUrl(asset) {
        if (st.thumbs.has(asset.path)) return st.thumbs.get(asset.path);
        const url = await toDataUrl(await api.readImage(asset.path)).catch(() => null);
        if (url) st.thumbs.set(asset.path, url);
        return url;
    }

    function clearFaces() {
        st.portraits.clear();
        st.thumbs.clear();
    }

    const refinding = new Map();
    async function refindPortrait(person) {
        const id = pid(person);
        if (person.isUser || st.busy || refinding.has(id)) return;
        const key = st.key;
        const wiki = st.wiki;
        refinding.set(id, st.portraits.get(id) ?? null);
        st.error = '';
        render();
        try {
            const fresh = await currentChar().catch(() => null);
            const char = fresh && charKey(fresh) === key ? fresh : st.char;
            if (st.key === key && char) st.char = char;
            await pickFaces(char, [person]);
            if (wiki) await saveWiki(key, wiki);
            st.portraits.delete(id);
            await loadPortrait(person);
        } catch (error) {
            console.warn(LOG, 'refind', person.name, error);
            st.error = '사진을 다시 고르지 못했습니다: ' + errText(error);
        } finally {
            refinding.delete(id);
            render();
        }
    }

    async function loadPortrait(person) {
        const id = pid(person);
        if (st.portraits.has(id)) return;
        st.portraits.set(id, null);
        try {
            let path = '';
            if (person.isUser) path = person.icon || '';
            else if (person.face === BOT_PIC) path = st.char?.image || '';
            else if (person.face) path = assetPool(st.char ?? {}).find(a => a.low === person.face.toLowerCase())?.path || '';
            if (!path) return;
            const url = await imageUrl({ path });
            if (url) { st.portraits.set(id, url); render(); }
        } catch (error) {
            console.warn(LOG, 'portrait', person.name, error);
        }
    }

    const FONT = '"Gowun Dodum","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const FONT_URL = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Cormorant+Garamond:ital@1&display=swap';
    const CSS = `
body.cw-on{margin:0;min-height:100vh;overflow-x:hidden;color:#373a3c;font:15px/1.55 ${FONT};padding:30px 16px 48px;box-sizing:border-box;background:rgba(0,0,0,.62)}
/* 탭을 바꿔 글 길이가 달라져도 오른쪽 스크롤바 자리를 늘 두어 가로 정렬이 흔들리지 않게 한다 (리사이징 창과 같은 자리에 뜬다) */
html:has(body.cw-on){background:transparent;overflow-y:scroll}
.cw{--paper:#fff;--paper2:#f5f5f5;--paper3:#eceef0;--line:#ccc;--line2:#bbb;--ink:#373a3c;--muted:#777;--dim:#bbb;--rose:#00a495;--rose2:#2bc3b3;--rose3:#008275;--blush:#e6f6f4;--gold:#00a495;--wlink:#0275d8;--wred:#d4493f;
  --f-body:${FONT};--f-display:"Gowun Batang","Nanum Myeongjo",serif;--f-num:"Cormorant Garamond","Gowun Batang",serif;--ease-out:cubic-bezier(.2,.8,.2,1);
  position:relative;box-sizing:border-box;max-width:780px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);min-width:0;color:var(--ink);font-family:var(--f-body);word-break:keep-all;overflow-wrap:anywhere;background:var(--paper);border:1px solid var(--line2);box-shadow:0 0 0 5px #fff,0 0 0 6px var(--line),0 34px 60px -34px rgba(0,0,0,.35)}
.cw *{box-sizing:border-box}
.cw [hidden]{display:none!important}
.cw button{font:inherit;color:inherit;cursor:pointer}
.cw h2,.cw h3,.cw p{margin:0}
.cw button:focus-visible,.cw [tabindex]:focus-visible{outline:2px solid var(--rose);outline-offset:2px}
/* 머리줄 — 청록 바탕 한 줄에 로고 · 위키 이름 · 탭 · 닫기. 줄이 넘쳐도 접히지 않고 위키 이름만 말줄임으로 줄인다 */
.cw-head{display:flex;align-items:center;gap:10px;height:52px;padding:0 6px 0 14px;color:#fff;background:var(--rose)}
.cw-brand{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.cw-brand i{flex:none;width:22px;height:22px}
.cw-brand b{min-width:0;overflow:hidden;font:700 17px var(--f-display);white-space:nowrap;text-overflow:ellipsis}
.cw-brand small{flex:none;font-size:12px;opacity:.78}
.cw-head svg,.cf-warn svg,.cw-empty-ic svg{display:block;width:100%;height:100%}
/* 탭 — 머리줄 안의 두 칸 묶음, 고른 칸만 흰 바탕 */
.cw-seg{flex:none;display:flex;gap:2px;padding:3px;background:rgba(0,0,0,.18)}
.cw-seg button{min-width:62px;height:34px;padding:0 12px;font-size:14px;color:#fff;background:transparent;border:0;opacity:.88}
.cw-seg button:hover{opacity:1;background:rgba(255,255,255,.12)}
.cw-seg button.on{font-weight:700;color:var(--rose3);background:#fff;opacity:1}
.cw .cw-x{flex:none;display:grid;place-items:center;width:42px;height:42px;padding:10px;color:#fff;background:transparent;border:0}
.cw .cw-x:hover{background:rgba(0,0,0,.18)}
/* 판 */
.cw-pane{min-width:0;padding:16px;zoom:var(--fz,1)}
.cw-pane.anim>*{animation:cw-rise .6s var(--ease-out) backwards}
.cw-pane.anim>:nth-child(2){animation-delay:.06s}
.cw-pane.anim>:nth-child(3){animation-delay:.12s}
.cw-pane.anim>:nth-child(4){animation-delay:.18s}
.cw-pane.anim>:nth-child(5){animation-delay:.24s}
@keyframes cw-rise{from{opacity:0;transform:translateY(12px)}}
.cw-acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:10px 0 6px}
.cw-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:6px 13px;font-size:.84rem;line-height:1.5;color:#373a3c;background:#fff;border:1px solid #ccc;white-space:nowrap;transition:background .15s,border-color .15s}
.cw-btn:hover:not(:disabled){background:#f5f5f5;border-color:#aaa}
.cw-btn:active:not(:disabled){background:#eceef0}
.cw-btn:disabled{opacity:.45;cursor:not-allowed}
.cw-btn.date{color:#fff;font-weight:700;background:var(--rose);border-color:var(--rose3)}
.cw-btn.date:hover:not(:disabled){background:var(--rose3);border-color:var(--rose3)}
.cw-btn.arm,.cw-btn.arm:hover:not(:disabled){color:#fff;background:#d4493f;border-color:#c9302c}
.cw-btn.on{color:#212529;background:#eceef0;border-color:#aaa;box-shadow:inset 0 1px 2px rgba(0,0,0,.12)}
.cw-msg{margin:8px 0 0;padding:8px 12px;font-size:.8rem;background:#fff;border:1px solid var(--line);border-left:4px solid var(--rose)}
.cw-msg.err{color:#8d2a22;border-left-color:var(--wred);background:#fff7f6}
.cw-prog{display:flex;align-items:center;gap:10px}
.cw-prog .tr{flex:1;height:8px;overflow:hidden;background:var(--paper3);border:1px solid var(--line)}
/* 게이지 (리사이징 플러그인과 같은 움직임): 지금 단계의 구간(--from → --to) 안에서 처음엔 빠르게, 갈수록 느리게 차오르고,
   그 위로 빛이 왼쪽에서 오른쪽으로 지나간다 */
.cw-prog .fi{position:relative;overflow:hidden;width:var(--to);height:100%;background:linear-gradient(90deg,var(--rose3),var(--rose));animation:cw-fill 60s cubic-bezier(.15,.6,.35,1) both}
.cw-prog .fi::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-100%);animation:cw-shine 1.6s ease-in-out infinite;animation-delay:var(--shine,0s)}
@keyframes cw-fill{from{width:var(--from)}to{width:var(--to)}}
@keyframes cw-shine{to{transform:translateX(100%)}}
.cw-prog-note{margin-top:4px;font-size:.74rem;color:var(--muted)}
/* 팁은 한 줄 높이 칸에 겹쳐 두고 차례로 나타났다 사라진다. 팁 수를 바꾸면 애니메이션 길이(4.5초 × 팁 수)와 cw-tip 의 18.4% · 20%(= 1/팁 수)도 맞춰 바꾼다 */
.cw-tip{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:.74rem;color:var(--muted)}
.cw-tip b{flex:none;padding:0 5px;font-size:.62rem;line-height:1.6;letter-spacing:.04em;color:#fff;background:var(--rose)}
.cw-tip-box{position:relative;flex:1;min-width:0;height:1.6em;overflow:hidden}
.cw-tip-box span{position:absolute;inset:0;line-height:1.6em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;animation:cw-tip 22.5s linear infinite}
@keyframes cw-tip{0%{opacity:0;transform:translateY(60%)}1.6%,18.4%{opacity:1;transform:none}20%,100%{opacity:0;transform:translateY(-60%)}}
/* 동작 줄이기를 켠 기기: 팁은 위아래로 움직이지 않고 흐려졌다 나타나기만 한다 (게이지의 빛은 리사이징처럼 그대로 지나간다) */
@media (prefers-reduced-motion:reduce){.cw-tip-box span{animation-name:cw-tip-fade}}
@keyframes cw-tip-fade{0%{opacity:0}1.6%,18.4%{opacity:1}20%,100%{opacity:0}}
/* 빈 화면(위키 없음 · 봇 없음 · 여는 중) — 그림 · 제목 · 설명 · 큰 버튼 · 만들 계획을 가운데 한 줄로 */
.cw-empty{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:460px;margin:28px auto 16px;text-align:center}
.cw-empty-ic{width:64px;height:64px;padding:14px;color:var(--rose);background:var(--blush)}
.cw-empty-ic.muted{color:var(--muted);background:var(--paper2)}
.cw .cw-empty h2{font:700 1.3em/1.4 var(--f-display);color:var(--ink)}
.cw .cw-lead{font-size:.95em;line-height:1.7;color:var(--muted)}
.cw-btn.lg{min-height:50px;padding:0 28px;font-size:1.07em;font-weight:700}
.cw-plan{width:100%;margin:6px 0 0;padding:0;font-size:.86em;text-align:left;background:var(--paper2);border:1px solid var(--line)}
.cw-plan div{display:grid;grid-template-columns:96px 1fr;gap:10px;padding:8px 12px;border-top:1px solid var(--line)}
.cw-plan div:first-child{border-top:0}
.cw-plan dt{color:var(--muted)}
.cw-plan dd{margin:0}
.cw .cw-link{padding:6px 2px;font-size:.9em;color:var(--wlink);background:none;border:0}
.cw-link:hover{text-decoration:underline}
/* 여는 중 화면: 단계 이름 아래 굵은 막대 (리사이징의 여는 중 막대와 같은 모양) */
.cw-load{flex-direction:column;align-items:stretch;gap:8px;width:100%;max-width:280px;font-size:.86rem;color:var(--muted)}
.cw-load .tr{flex:none;height:20px}
.cw-load .fi::after{background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.45) 50%,transparent 80%)}
/* 설정 판 — 맨 위 안내 상자, 묶음 제목 아래 카드 한 장에 줄을 쌓는다 */
.cf-warn{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:11px 14px;font-weight:700;background:var(--blush);border:1px solid color-mix(in srgb,var(--rose) 35%,var(--line))}
.cf-warn i{flex:none;width:18px;height:18px;color:var(--rose)}
.cf-warn span{flex:1;min-width:180px}
.cf-grp{margin-top:22px}
.cw .cf-grp>h2{display:flex;align-items:center;gap:10px;margin:0 0 8px;padding-left:2px;font:700 1.08em var(--f-display)}
/* 구역 제목 앞 마름모 (리사이징 고급 설정 탭과 같은 모양, 색은 챠위키 초록) */
.cw .cf-grp>h2::before{content:"";flex:none;width:7px;height:7px;background:var(--rose);transform:rotate(45deg)}
.cw .cf-note{margin:-2px 0 8px;padding-left:2px;font-size:.84em;color:var(--muted)}
.cf-card{background:#fff;border:1px solid var(--line)}
.cf-card.cols{display:grid;grid-template-columns:1fr}
.cf-dev{display:flex;align-items:center;gap:12px;margin-top:22px;padding:10px 14px;color:#e8ebf1;background:#141c2e;border:1px solid #141c2e}
.cf-dev-gh{flex:none;display:flex;width:24px;height:24px;color:#fff}
.cf-dev-gh svg{width:100%;height:100%;fill:currentColor}
.cf-dev-tx{flex:1 1 0;min-width:0;line-height:1.35}
.cw .cf-dev-tx small{display:inline;margin-right:6px;font-size:.66rem;letter-spacing:.08em;color:#9aa4b6}
.cw .cf-dev-tx b{display:inline;font-size:.92rem;color:#fff;user-select:text}
.cw .cf-dev-tx span{display:block;margin-top:1px;font-size:.72rem;line-height:1.45;color:#b9c1cf}
.cw .cf-dev-tx .cf-dev-msg{color:#ffd27a;user-select:text;overflow-wrap:anywhere}
.cw .cf-dev-tx .cf-dev-msg:empty{display:none}
.cw .cf-dev-go{flex:none;padding:5px 11px;font-size:.76rem;color:#fff;background:transparent;border:1px solid #c7cdd6}
.cw .cf-dev-go:hover{background:#22304d}
@media (max-width:520px){.cf-dev{flex-wrap:wrap}.cw .cf-dev-go{width:100%}}
.cf-card.danger{background:#fdf4f3;border-color:color-mix(in srgb,var(--wred) 40%,var(--line))}
.cf-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:13px 14px;border-top:1px solid var(--line)}
.cf-row:first-child{border-top:0}
.cf-row.sw{flex-wrap:nowrap}
.cf-row.sw .cf-tx{flex:1 1 0}
.cf-row.col{flex-direction:column;align-items:stretch}
.cf-row.col .cf-tx{flex:none}
.cf-tx{flex:1 1 250px;min-width:0}
.cf-tx>b{display:block;font-size:.97em;line-height:1.4}
.cw .cf-tx p{margin:3px 0 0;font-size:.84em;line-height:1.6;color:var(--muted)}
.cw .cf-tx p.cost{color:var(--ink)}
.cf-rec{display:inline-block;margin-left:6px;padding:0 6px;font:400 11px/1.6 var(--f-body);font-style:normal;color:var(--rose3);vertical-align:2px;white-space:nowrap;background:var(--blush)}
/* 「자세히」 — 긴 설명은 접어 두고 눌러서 편다 */
.cf-tx details{margin-top:2px;font-size:.84em;color:var(--muted)}
.cf-tx summary{width:max-content;color:var(--wlink);cursor:pointer;list-style:none}
.cf-tx summary::-webkit-details-marker{display:none}
.cf-tx summary::after{content:" ▾"}
.cf-tx details[open] summary::after{content:" ▴"}
.cw .cf-tx details p{margin:2px 0 0;font-size:1em}
/* 켜짐 · 꺼짐 스위치 */
.cf-tg{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 2px;background:none;border:0}
.cf-tg-lb{min-width:2.4em;font-size:.86em;color:var(--muted);text-align:right}
.cf-tg-tr{position:relative;width:46px;height:26px;background:var(--line2);border-radius:13px;transition:background .15s}
.cf-tg-tr i{position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.cf-tg.on .cf-tg-lb{font-weight:700;color:var(--rose3)}
.cf-tg.on .cf-tg-tr{background:var(--rose)}
.cf-tg.on .cf-tg-tr i{left:23px}
/* 여럿 중 하나를 고르는 칸 — 고른 칸만 채운다 */
.cf-seg{flex:none;display:inline-flex;max-width:100%;border:1px solid var(--line2)}
.cf-seg button{min-height:36px;padding:0 13px;font-size:.88em;background:#fff;border:0;border-left:1px solid var(--line2);white-space:nowrap}
.cf-seg button:first-child{border-left:0}
.cf-seg button:hover:not(:disabled):not(.sel){color:var(--rose3);background:var(--blush)}
.cf-seg button.sel{font-weight:700;color:#fff;background:var(--rose)}
.cf-seg button:disabled{opacity:.45;cursor:not-allowed}
.cf-ta{width:100%;min-height:100px;padding:9px 11px;font:inherit;font-size:.88em;line-height:1.6;color:var(--ink);background:#fff;border:1px solid var(--line2);resize:vertical}
.cf-ta:focus{outline:none;border-color:var(--rose)}
.cf-ta:disabled{background:var(--paper2)}
.cf-num{width:110px;min-height:36px;padding:0 10px;font:inherit;font-size:.88em;text-align:right;color:var(--ink);background:#fff;border:1px solid var(--line2)}
.cf-num:focus{outline:none;border-color:var(--rose)}
.cf-num:disabled{background:var(--paper2)}
.cw .cf-hint{margin:8px 2px 0;padding:8px 12px;font-size:.84em;color:var(--ink);background:var(--paper2);border-left:3px solid var(--line2)}
.cw-btn.danger{color:var(--wred);border-color:color-mix(in srgb,var(--wred) 50%,var(--line))}
.cw-btn.danger:hover:not(:disabled){color:var(--wred);background:#fff;border-color:var(--wred)}
.cf-card .cw-btn.arm{animation:cw-arm 1s ease-in-out infinite alternate}
@keyframes cw-arm{to{box-shadow:0 0 0 4px color-mix(in srgb,var(--wred) 25%,transparent)}}
@media (min-width:700px){.cf-card.cols{grid-template-columns:1fr 1fr}.cf-card.cols .cf-row:nth-child(2){border-top:0}.cf-card.cols .cf-row:nth-child(even){border-left:1px solid var(--line)}}
/* 사람 목록 — 스쿨잼 잼위키 .wk-list */
.wk-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 12px;margin-bottom:6px}
.wk-top h2{font-family:var(--f-display);font-size:1.12rem}
.wk-top span{font-size:.8rem;color:var(--muted)}
.wk-top .wk-resume{margin-left:10px;padding:2px 10px;font-size:.78rem;vertical-align:2px}
.wk-top b{font-family:var(--f-num);font-style:italic;font-size:1.25rem;color:var(--gold)}
.wk{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:12px;align-items:start}
.wk-list{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:5px}
.wk-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;align-content:start;gap:4px;padding:5px 3px 6px;background:#fff;border:1px solid var(--line);transition:border-color .2s,background .2s,box-shadow .2s}
/* 그림 자리는 액자 — 흰 여백 2px 안쪽에 그림, 바깥은 회색 테두리 */
.wk-face{position:relative;display:grid;place-items:center;box-sizing:border-box;width:min(56px,100%);aspect-ratio:1;overflow:hidden;padding:2px;border:1px solid #c4c8cc;box-shadow:0 1px 0 #e3e5e7;font-family:var(--f-display);font-size:1.45rem;color:#fff;background:#fff;transition:border-color .2s}
.wk-face img{position:absolute;inset:2px;width:calc(100% - 4px);height:calc(100% - 4px);object-fit:contain;object-position:50% 50%;background:#fff}
.wk-face.pic{color:transparent}
.wk-face.home{font-size:1.2rem;color:var(--rose);background:var(--blush);box-shadow:inset 0 0 0 2px #fff}
/* 올려 두면 움직이지 않고 칸 색만 살짝 바뀐다 */
.wk-row:hover{background:var(--blush);border-color:var(--rose2)}
.wk-row:hover .wk-face{border-color:var(--rose2)}
.wk-row.sel{border-color:var(--rose);box-shadow:inset 0 3px 0 var(--rose)}
.wk-row.sel .wk-face{border-color:var(--rose)}
.wk-row.sel .wk-nm b{color:var(--rose3);font-weight:700}
/* 기본 프로필 그림(실루엣) — 칸(wk-face)과 정보 상자(nw-df)가 같은 모양을 쓴다 */
.df-sil{color:#c9ced3;background:transparent}
.df-sil svg{width:82%;height:82%;margin-top:18%;fill:currentColor}
.wk-face.df-sil{background:#f6f7f8;box-shadow:inset 0 0 0 2px #fff,0 1px 0 #e3e5e7}
.nw-df{display:grid;place-items:center;align-content:center;gap:6px;width:100%;aspect-ratio:1;max-height:380px;margin:0;overflow:hidden;font-family:var(--f-display);font-size:4.2rem}
.nw-df.df-sil svg{width:86%;height:86%;margin-top:14%}
.nw-df small{font-family:var(--f-body);font-size:.8rem;color:#9a9ea2}
.wk-nm{display:grid;gap:1px;justify-items:center;width:100%;line-height:1.3;min-width:0;text-align:center}
.wk-nm b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;overflow:hidden;font-family:var(--f-display);font-size:.92rem;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
.wk-row.unmet .wk-face{border-style:dashed;opacity:.55}
.wk-row.unmet .wk-nm b{color:#9a9ea2;letter-spacing:.1em}
.wk-row.wait .wk-face{opacity:.45}
.wk-row.bad{border-color:var(--wred)}
.wk-row.bad .wk-face{border-color:var(--wred);opacity:1}
.wk-row.bad .wk-nm b{color:var(--wred)}
.wk-row .sp-dot{position:absolute;top:3px;right:3px;z-index:1;padding:0 4px;font-size:.58rem;line-height:1.5;color:#fff;background:#55595c}
/* 문서 — 흰 종이 · 회색 줄(나무위키) · 윗줄과 정보 상자만 그 사람 색 */
.wk-d{--tc:var(--rose);min-width:0;scroll-margin-top:16px;padding:16px 18px 18px;background:#fff;border:1px solid #ccc;border-top:3px solid var(--tc);font-size:.86rem;line-height:1.75;color:#373a3c}
.wk-d.anim{animation:cw-rise .4s var(--ease-out) backwards}
.nw-hd{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;padding-bottom:8px;border-bottom:1px solid #e5e5e5}
.nw-title{margin:0;font-size:1.6rem;line-height:1.25;font-weight:700;color:#212529}
.nw-edit{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:.7rem;color:#8a8f93}
.nw-edit button{padding:2px 9px;font-size:.7rem;color:#373a3c;background:#fff;border:1px solid #ccc}
.nw-edit button:hover:not(:disabled){background:#f5f5f5;border-color:#aaa}
.nw-edit button:disabled{opacity:.45;cursor:not-allowed}
.nw-edit button.arm,.nw-edit button.arm:hover:not(:disabled){color:#fff;background:#d4493f;border-color:#c9302c}
.nw-cat{display:flex;flex-wrap:wrap;align-items:center;margin-top:10px;padding:4px 10px;font-size:.76rem;line-height:1.7;background:#fafafa;border:1px solid #ccc}
.nw-cat b{margin-right:8px}
.nw-cat span{color:var(--wlink);white-space:nowrap}
.nw-cat span+span::before{content:"|";margin:0 7px;color:#aaa}
.nw-quote{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 14px;margin:12px 0 0;padding:9px 14px;font-size:.88rem;line-height:1.65;background:#f8f9fa;border:2px dashed #ccc;border-left:5px solid var(--tc)}
.nw-quote .nw-qt{flex:1 1 16em;min-width:0}
.nw-quote small{flex:none;margin-left:auto;font-size:.72rem;color:#8a8f93}
.nw-top{display:block;margin-top:14px}
.nw-top::after{content:"";display:table;clear:both}
.nw-toc{display:inline-block;vertical-align:top;min-width:170px;max-width:calc(100% - 254px);padding:9px 18px 10px 12px;background:#fff;border:1px solid #ccc}
.nw-toc b{display:block;margin-bottom:2px;font-size:.92rem}
.nw-toc ol{list-style:none;margin:0;padding:0;font-size:.82rem;line-height:1.85}
.nw-toc li{cursor:pointer}
.nw-toc li:hover{text-decoration:underline}
.nw-toc a,.nw-h a{color:var(--wlink);text-decoration:none}
.nw-toc small{margin-left:6px;font-size:.62rem;padding:0 4px;color:#fff;background:#8a8f93}
/* 정보 상자 — 머리 칸 · 그림 칸은 그 사람 색 */
.nw-box{float:right;width:236px;margin:0 0 14px 18px;border-collapse:collapse;font-size:.76rem;line-height:1.5;border:2px solid var(--tc)}
.nw-box th,.nw-box td{padding:4px 8px;border:1px solid color-mix(in srgb,var(--tc) 28%,#fff);vertical-align:middle}
.nw-box th{width:5.4em;font-weight:700;text-align:center;word-break:keep-all;color:color-mix(in srgb,var(--tc) 72%,#222);background:color-mix(in srgb,var(--tc) 11%,#fff)}
.nw-box td.nw-bh{padding:6px 8px;text-align:center;color:#fff;background:var(--tc)}
.nw-bh b{display:block;font-size:1.05rem;line-height:1.3}
.nw-bh small{font-size:.68rem;opacity:.85;letter-spacing:.06em}
.nw-bh em{display:block;margin-top:1px;font-style:normal;font-size:.72rem;opacity:.95}
.nw-bh em::before,.nw-bh em::after{content:"·";margin:0 5px;opacity:.7}
.nw-box td.nw-bp{position:relative;padding:0;background:#fff}
.nw-bp img{display:block;max-width:100%;max-height:380px;margin:0 auto;object-fit:contain}
.nw-s{margin-top:18px}
.nw-h{display:flex;align-items:baseline;gap:6px;margin:0 0 8px;padding-bottom:4px;font-size:1.12rem;font-weight:700;color:#212529;border-bottom:1px solid #ccc}
.nw-p{margin:0 0 8px}
.nw-ul{margin:0;padding-left:20px}
.nw-ul li{margin-bottom:3px}
.nw-ul li.nw-dl{margin:0 0 9px}
.nw-dl b{display:block;margin:0 0 2px;color:var(--ink)}
.nw-a{color:var(--wlink);cursor:pointer}
.nw-a:hover{text-decoration:underline}
.nw-fr{margin-left:1px;font-size:.66rem;color:var(--wlink);cursor:pointer}
.wk-d del{color:#9aa0a6}
.nw-fn{clear:both;margin-top:22px;padding-top:8px;font-size:.74rem;line-height:1.6;color:#55595c;border-top:1px solid #ccc}
.nw-fn h4{margin:0 0 4px;font-size:.82rem;color:#373a3c}
.nw-fn ol{list-style:none;display:grid;gap:2px;margin:0;padding:0}
.nw-fn li>span:first-child{color:var(--wlink)}
.wk-d::after{content:"";display:block;clear:both}
/* 맨 아래 줄(최근 수정 시각 옆) 「이 문서 복사」 */
.nw-copy,.nw-copy-in{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px 10px}
.nw-copy button{padding:2px 10px;font-size:.72rem;color:#373a3c;background:#fff;border:1px solid #ccc;cursor:pointer}
.nw-copy button:hover{background:#f5f5f5;border-color:#aaa}
.nw-copy .ok{color:var(--rose3)}
.nw-copy .no{color:var(--wred)}
/* 스포일러 — 「스포」 띠 · 눌러야 보인다 */
.nw-sp{color:transparent;background:#55595c;cursor:pointer;transition:background .2s,color .2s;-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 2px}
.nw-sp *{color:transparent!important;background:transparent}
.nw-sp:hover{background:#3d4043}
.nw-sp.open{color:inherit;background:#eceef0;cursor:auto}
.nw-sp.open *{color:inherit!important}
.nw-sp.open .nw-a{color:var(--wlink)!important}
.nw-sp-tag{padding:0 6px;font-size:.62rem;font-weight:700;letter-spacing:.08em;line-height:1.6;color:#fff;background:#55595c}
.nw-spbox{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;width:100%;padding:7px 12px;font:inherit;font-size:.78rem;line-height:1.55;text-align:left;color:#55595c;background:#fff;border:1px solid color-mix(in srgb,var(--tc) 45%,#fff);border-left:6px solid var(--tc);cursor:pointer}
.nw-spbox b{padding:0 8px;font-size:.7rem;letter-spacing:.08em;color:#fff;background:var(--tc)}
.nw-spbox span{flex:1 1 220px}
.nw-spbox:hover{background:#fafafa}
.nw-box tr.sp-row td{cursor:pointer}
.nw-box tr.sp-row td .nw-sp-tag{margin-right:4px}
.nw-none .nw-title{letter-spacing:.16em;color:#aaa}
.nw-nf{margin:16px 0 4px;font-size:.95rem}
.nw-nf2{margin:0;font-size:.82rem;color:var(--muted)}
.nw-err{margin-top:12px;padding:8px 12px;font-size:.8rem;color:#8d2a22;background:#fff7f6;border:1px solid #f0c9c4}
/* 대문의 인물 표 */
.nw-idx{width:100%;border-collapse:collapse;font-size:.82rem}
.nw-idx th,.nw-idx td{padding:5px 8px;border:1px solid #e5e5e5;text-align:left;vertical-align:top}
.nw-idx th{width:30%;white-space:nowrap;background:#fafafa}
.nw-idx th i{display:inline-block;width:.7em;height:.7em;margin-right:6px;background:var(--tc)}
/* 2.8.0 업데이트 탭 — 탭 줄의 주황 점과 업데이트 화면(리수 화면을 본뜬 그림 다섯 장) */
.cw-seg .sg-upd{display:inline-flex;align-items:center;gap:5px}
.cw-seg .sg-ic{flex:none;display:block;width:15px;height:15px}
.sg-dot{flex:none;display:block;width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.25),0 0 6px rgba(245,158,11,.8)}
.up-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:0 0 14px;padding:12px 14px;color:#e8ebf1;background:#141c2e}
.up-top-tx{flex:1 1 280px;min-width:0;line-height:1.45}
.up-top-tx b{display:block;font-size:.95rem;color:#fff}
.up-top-tx span{display:block;margin-top:3px;font-size:.76rem;color:#b9c1cf}
.up-act{flex:none;display:flex;gap:6px}
.cw .up-no{padding:6px 12px;font-size:.78rem;color:#b9c1cf;background:transparent;border:1px solid #4a5468}
.cw .up-no:hover{background:#22304d}
.up-steps{display:flex;flex-direction:column;gap:12px}
.up-step{display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid var(--line)}
.up-cap{display:flex;align-items:flex-start;gap:9px;min-height:54px;padding:10px 11px;font-size:.8rem;line-height:1.45}
.up-cap b{color:var(--ink)}
.up-cap small{display:block;margin-top:2px;font-size:.7rem;color:var(--muted)}
.up-n{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;font-size:.78rem;font-weight:800;color:#1b1b1b;background:#fbbf24}
.up-fig{position:relative;flex:1 1 auto;display:flex;min-height:190px;overflow:hidden;color:#e6e7ee;background:#1f2029;font-size:.72rem;line-height:1.3}
.up-i{display:inline-flex;flex:none;width:16px;height:16px}
.up-i svg{display:block;width:100%;height:100%}
.up-hit{position:relative;display:inline-flex;outline:2px solid #fbbf24;outline-offset:3px;animation:up-ring 1.4s ease-in-out infinite}
@keyframes up-ring{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.55)}50%{box-shadow:0 0 0 9px rgba(251,191,36,0)}}
.up-cur{position:absolute;right:-15px;bottom:-19px;z-index:2;width:20px;height:20px;pointer-events:none}
.up-cur svg{display:block;width:100%;height:100%;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.up-scr{flex:1 1 auto;display:flex}
.up-side{flex:none;display:flex;flex-direction:column;align-items:center;gap:9px;width:62px;padding:10px 0;background:#181920;border-right:1px solid #33354a}
.up-ham{display:inline-flex;align-items:center;justify-content:center;width:42px;height:22px;color:#fff;background:#6b7080}
.up-pop{display:flex;flex-direction:column;align-items:center;gap:9px;width:52px;padding:8px 0;color:#e6e7ee;background:#1f2029;border-bottom:1px solid #44475a}
.up-pop .up-i{width:18px;height:18px}
.up-av{display:block;flex:none;width:30px;height:30px;border-radius:50%;background:#3a3c4e}
.up-chat{flex:1 1 auto;display:flex;flex-direction:column;gap:9px;padding:14px 12px}
.up-chat i{display:block;height:9px;background:#34364a}
.up-chat i.me{align-self:flex-end;background:#2d3c63}
.up-menu{flex:1 1 auto;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:10px 14px}
.up-mi{display:inline-flex;align-items:center;gap:6px;padding:2px 4px;color:#b7b9c8}
.up-mi.on{font-weight:700;color:#fff}
.up-mi .up-i{width:13px;height:13px}
.up-plug{flex:1 1 auto;display:flex;flex-direction:column;padding:12px 14px}
.up-pt{font-size:1rem;color:#fff}
.up-warn{margin:3px 0 9px;font-size:.66rem;color:#ff5555}
.up-list{border:1px solid #44475a;padding:2px 10px}
.up-row{display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid #44475a;color:#9aa0b4}
.up-row:first-child{border-top:0}
.up-row.dim{opacity:.45}
.up-pn{flex:1 1 auto;min-width:0;font-weight:700;color:#e6e7ee}
.up-pn em{margin-left:6px;font-style:normal;font-weight:400;color:#9aa0b4}
.up-i.g{color:#4ade80}
.up-dlg{flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.35)}
.up-box{width:100%;max-width:220px;padding:12px;background:#282a36;border:1px solid #44475a}
.cw .up-box p{margin:0 0 12px;font-size:.72rem;line-height:1.5;color:#e6e7ee}
.up-yn{display:flex;gap:10px}
.up-yes,.up-no2{display:inline-flex;align-items:center;justify-content:center;width:64px;height:24px;font-weight:700}
.up-yes{color:#fff;background:#3b82f6}
.up-no2{color:#e6e7ee;background:#44475a}
.up-after{margin-top:14px;padding:11px 14px;font-size:.78rem;line-height:1.55;background:var(--paper2);border-left:3px solid #fbbf24}
.up-after ul{margin:5px 0 0;padding-left:18px}
.up-after li+li{margin-top:3px}
@media (max-width:600px){.up-act{width:100%}.cw .up-no{flex:1 1 0}}
/* 2.10.0 에셋 탭 — 찾기 줄 · 인물로 가는 칩 · 인물별 격자. 칸은 체크무늬 위에 그림을 맞춰 넣고, 소리 · 영상은 아이콘으로 */
.av svg{display:block;width:100%;height:100%}
.av-note{margin:0 0 12px;font-size:.8rem;color:var(--muted)}
.av-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:12px}
.av-find{position:relative;flex:1 1 200px;min-width:0}
.av-find i{position:absolute;left:10px;top:50%;width:15px;height:15px;color:#999;transform:translateY(-50%)}
.av-find input{width:100%;height:36px;padding:0 40px 0 32px;font:inherit;font-size:.86em;color:var(--ink);background:#fff;border:1px solid var(--line2);border-radius:0}
.av-find input:focus{outline:none;border-color:var(--rose)}
.av-find input::-webkit-search-cancel-button{display:none}
.av-find .av-clr{position:absolute;right:0;top:0;display:grid;place-items:center;width:36px;height:36px;padding:11px;color:#888;background:transparent;border:0;cursor:pointer}
.av-find .av-clr:hover{color:var(--ink);background:rgba(0,0,0,.05)}
.av-find .av-clr[hidden]{display:none}
.av-find .av-clr svg{display:block;width:14px;height:14px}
.av-pic{position:relative;display:grid;place-items:center;width:100%;aspect-ratio:1;overflow:hidden;padding:2px;border:1px solid #c4c8cc;box-shadow:0 1px 0 #e3e5e7;background:#fff}
.av-pic::before{content:"";position:absolute;inset:2px;background:conic-gradient(#f1f2f3 25%,#fff 0 50%,#f1f2f3 0 75%,#fff 0) 0 0/14px 14px}
.av-pic img{position:absolute;inset:2px;width:calc(100% - 4px);height:calc(100% - 4px);object-fit:contain;opacity:0;transition:opacity .25s}
.av-pic img.ok{opacity:1}
.av-pic.wait::after{content:"";position:absolute;inset:2px;background:linear-gradient(100deg,#eceef0 30%,#f8f9fa 50%,#eceef0 70%) 0 0/300% 100%;animation:av-shine 1.2s linear infinite}
@keyframes av-shine{from{background-position:100% 0}to{background-position:0 0}}
.av-pic.media,.av-pic.bad{color:#7d848a;background:#f6f7f8}
.av-pic.media::before,.av-pic.bad::before{display:none}
.av-pic.media i{width:38%;height:38%}
.av-pic.media em{position:absolute;bottom:6px;font:italic 700 .7rem var(--f-num);letter-spacing:.08em}
.av-pic.bad{color:var(--wred)}
.av-pic.bad em{font-size:.7rem;font-style:normal}
.av-tag{position:absolute;top:3px;left:3px;z-index:2;padding:0 5px;font-size:.6rem;line-height:1.6;color:#fff;background:#55595c}
.av-tag.emo{background:#8a6a3a}
.av-tag.add{background:#455a64}
.av-tag.bot{background:var(--rose)}
.av-tag.face{left:auto;right:3px;background:var(--rose3)}
.av-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;overflow:hidden;font-size:.78rem;line-height:1.35;text-align:center;word-break:break-all}
.av-hit{color:var(--rose3);background:var(--blush)}
.av-none{padding:26px 10px;font-size:.86rem;text-align:center;color:var(--muted);background:var(--paper2);border:1px dashed var(--line2)}
.ga-t{display:grid;gap:4px;align-content:start;justify-items:center;min-width:0;padding:5px 5px 6px;text-align:left;background:#fff;border:1px solid var(--line);transition:border-color .2s,background .2s}
.ga-t:hover{background:var(--blush);border-color:var(--rose2)}
.ga-t:hover .av-pic{border-color:var(--rose2)}
.ga-t .av-name{min-height:2.7em}
/* 칩 줄은 가로로 숨겨 밀지 않고 접어 내린다 — 오른쪽 끝 칩이 잘려 보이던 문제. 이름이 길면 칩 안에서 말줄임 */
.gp-jump{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.gp-jump button{flex:none;max-width:100%;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 4px;font-size:.8rem;background:#fff;border:1px solid var(--line)}
.gp-jump button:hover{background:var(--blush);border-color:var(--rose2)}
.gp-jump button i{flex:none;width:24px;height:24px;background:var(--c,#999) center/cover}
.gp-jump button i.ic{display:grid;place-items:center;padding:4px;color:#fff}
.gp-jump button span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gp-jump small{flex:none;font-family:var(--f-num);font-style:italic;font-size:1rem;color:var(--muted)}
.gp-s{margin-top:18px;scroll-margin-top:12px}
.gp-h{display:flex;align-items:center;gap:10px;margin:0 0 8px;padding:0 0 6px;border-bottom:2px solid var(--c,var(--line))}
.gp-h>div{min-width:0}
.gp-h .av-pic{flex:none;width:34px;padding:1px}
.gp-h .av-pic::before{inset:1px}
.gp-h .av-pic img{inset:1px;width:calc(100% - 2px);height:calc(100% - 2px)}
.gp-h .gp-sq{flex:none;display:grid;place-items:center;width:34px;height:34px;padding:7px;color:#fff;background:var(--c)}
.cw .gp-h h3{font:700 1.08rem var(--f-display)}
.gp-h span{display:block;overflow:hidden;font-size:.76rem;color:var(--muted);white-space:nowrap;text-overflow:ellipsis}
.gp-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:6px}
.gp-g.wide{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.gp-g.wide .av-pic{aspect-ratio:16/10}
.gp-fb{display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:8px 12px;font-size:.8rem;background:var(--paper2);border-left:3px solid var(--line2)}
/* 크게 보기 · 알림 — 패널(.cw) 밖 body 에 붙는다. 패널이 다시 그려져도 사라지지 않게 */
.cw-lb{--rose:#00a495;--rose3:#008275;position:fixed;inset:0;z-index:2147483000;display:grid;grid-template-rows:auto minmax(0,1fr) auto;color:#fff;font:14px/1.5 ${FONT};background:rgba(10,12,14,.92);animation:lb-in .18s ease-out}
@keyframes lb-in{from{opacity:0}}
.cw-lb *{box-sizing:border-box}
.cw-lb svg{display:block;width:100%;height:100%}
.cw-lb button{font:inherit;color:#fff;cursor:pointer;background:transparent;border:0}
.cw-lb button:hover{background:rgba(255,255,255,.1)}
.cw-lb button:focus-visible{outline:2px solid #2bc3b3;outline-offset:2px}
.lb-top{display:flex;align-items:center;gap:10px;padding:8px 72px 8px 16px}
.lb-top b{flex:1;min-width:0;overflow:hidden;font:700 15px "Gowun Batang",serif;white-space:nowrap;text-overflow:ellipsis;user-select:text}
.lb-top span{flex:none;font:italic 16px "Cormorant Garamond",serif;color:#aab}
.lb-x{display:grid;place-items:center;width:42px;height:42px;padding:10px}
.lb-mid{position:relative;display:grid;place-items:center;min-height:0;padding:0 56px}
.lb-mid img,.lb-mid video{position:absolute;top:0;left:56px;width:calc(100% - 112px);height:100%;object-fit:contain}
.lb-nav{position:absolute;top:50%;width:46px;height:64px;padding:12px;transform:translateY(-50%)}
.lb-nav.p{left:4px}
.lb-nav.n{right:4px}
.lb-media{display:grid;justify-items:center;gap:14px;color:#c9ced3;text-align:center}
.lb-media i{width:90px;height:90px}
.lb-media audio{width:min(420px,72vw)}
.lb-wait{font-size:.86rem;color:#9aa3ad}
.lb-bot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 16px 14px;font-size:.8rem;color:#b9c1cf}
.lb-bot .av-tag{position:static}
.lb-bot .sp{flex:1}
.cw-lb .lb-bot button.cp{padding:5px 12px;font-size:.8rem;border:1px solid #6c757d}
.av-toast{position:fixed;left:50%;bottom:22px;z-index:2147483001;max-width:calc(100vw - 32px);padding:7px 14px;font:13px/1.5 ${FONT};color:#fff;background:#212529;box-shadow:0 0 0 1px rgba(255,255,255,.25),0 4px 14px rgba(0,0,0,.35);transform:translate(-50%,10px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.av-toast.on{opacity:1;transform:translate(-50%,0)}
@media (max-width:520px){
  .cw-brand small{display:none}
  .cw-seg button{min-width:0;padding:0 10px}
  .lb-mid{padding:0 6px}
  .lb-mid img,.lb-mid video{left:6px;width:calc(100% - 12px);height:calc(100% - 64px)}
  .lb-nav{top:auto;bottom:4px;height:52px;transform:none}
}
/* 아래 바 */
.cw-foot{position:relative;display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;padding:10px 16px 12px;border-top:1px solid var(--line);font-size:.72rem;color:var(--muted);background:var(--paper2)}
@media (max-width:600px){
  body.cw-on{padding:22px 10px 36px}
  .cw-pane{padding:12px}
  .cw-btn{min-height:34px;padding:0 10px;font-size:.8rem}
  .wk-list{grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}
  .wk-row{padding:4px 3px 5px}
  .wk-face{width:min(76px,100%)}
  .wk-nm b{font-size:.8rem}
  .wk-d{padding:12px 12px 14px}
  .nw-title{font-size:1.35rem}
  .nw-box{float:none;width:100%;margin:0 0 12px}
  .nw-bp img{max-height:300px;width:52%;object-fit:contain}
  .nw-toc{display:block;max-width:none;min-width:0}
  .nw-toc ol{columns:2}
  .nw-idx{table-layout:fixed}
  .nw-idx th{width:32%;padding:5px 6px;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
  .gp-g{grid-template-columns:repeat(auto-fill,minmax(84px,1fr))}
  .gp-g.wide{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
}
@media (max-width:420px){
  .wk-list{grid-template-columns:repeat(4,minmax(0,1fr))}
  .cw-brand small{display:none}
  .cw-seg button{min-width:0;padding:0 10px}
  .cw-seg .sg-upd .sg-tx{display:none}
  .cw-btn{gap:3px;padding:0 8px;font-size:.76rem}
}
`;

    function h(tag, props, ...children) {
        const el = doc.createElement(tag);
        for (const [key, value] of Object.entries(props ?? {})) {
            if (value == null || value === false) continue;
            if (key === 'class') el.className = value;
            else if (key === 'style') el.style.cssText = value;
            else if (key === 'html') el.innerHTML = value;
            else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
            else if (key === 'disabled' || key === 'checked') el[key] = true;
            else el.setAttribute(key, String(value));
        }
        for (const child of children.flat(Infinity)) {
            if (child == null || child === false || child === '') continue;
            el.append(typeof child === 'object' ? child : String(child));
        }
        return el;
    }

    const FICTION_CAT = /^\s*(가상|가공|허구|창작)(의)?\s*(인물|캐릭터|존재|등장인물)?\s*$|^\s*fictional(\s+(characters?|people|persons?))?\s*$/i;
    function catRow(list) {
        const cats = list.filter(c => !FICTION_CAT.test(c));
        return cats.length ? h('div', { class: 'nw-cat' }, h('b', null, '분류'), cats.map(c => h('span', null, c))) : null;
    }

    function colorOf(name) {
        let x = 0;
        for (const c of String(name)) x = (x * 31 + c.codePointAt(0)) >>> 0;
        return PALETTE[x % PALETTE.length];
    }

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function inline(text, ctx) {
        const notes = (str, spoiler) => str.replace(/\(\((.+?)\)\)/g, (_, body) => {
            ctx.notes.push({ body, spoiler });
            const n = ctx.notes.length;
            return `<sup class="nw-fr" data-fn="${n}">[${n}]</sup>`;
        });
        let s = esc(text).split(/\|\|(.+?)\|\|/g).map((part, i) => i % 2 && !ctx.spoiler
            ? `<span class="nw-sp${st.revealAll ? ' open' : ''}" title="스포일러 — 눌러서 보기">${notes(part, true)}</span>`
            : notes(part, ctx.spoiler)).join('');
        s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
        s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        s = s.replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, (_, target, label) => {
            const p = findPerson(target);
            const fits = st.lang === 'en' ? LATIN.test(target) : /[가-힣]/.test(target);
            const shown = label || (p && !fits ? esc(shownName(p)) : target);
            return p ? `<span class="nw-a" data-go="${esc(p.name)}">${shown}</span>` : shown;
        });
        return s;
    }

    function findPerson(name) {
        const n = String(name).replace(/&amp;/g, '&').trim();
        return st.wiki?.people.find(p => p.name === n || (p.aliases ?? []).includes(n)) ?? null;
    }

    function spoilerBlock(label, inner) {
        if (st.revealAll) return inner;
        const wrap = h('div', { class: 'nw-spw' });
        const btn = h('button', {
            type: 'button', class: 'nw-spbox',
            onclick: () => {
                if (wrap.dataset.sp) ui.spOpen.add(wrap.dataset.sp);
                wrap.replaceChildren(inner);
            },
        }, h('b', null, '스포일러'), h('span', null, `${label} 문단에는 이야기의 비밀이 들어 있다. 눌러서 펼친다.`));
        wrap.append(btn);
        return wrap;
    }

    const ui = { root: null, fit: null, tab: 'wiki', lastTab: null, lastSel: null, animPane: false, animDoc: false, spRef: undefined, spOpen: new Set(), det: new Set() };
    const av = { key: '', q: '', sig: '', pane: null, body: null, pool: [], faces: new Map(), io: null, queue: [], running: 0, urls: new Map(), reading: new Map(), want: new WeakMap(), lb: null, lbEl: null, lbTok: null, toast: null, toastTimer: 0 };

    function render() {
        if (!ui.root) return;
        const scroller = doc.scrollingElement ?? doc.documentElement;
        const keep = scroller.scrollTop;
        ui.animPane = ui.lastTab !== ui.tab;
        ui.animDoc = ui.animPane || ui.lastSel !== st.sel;
        ui.lastTab = ui.tab;
        ui.lastSel = st.sel;
        ui.root.style.setProperty('--fz', String(FONTS.find(x => x[0] === st.font)?.[2] ?? 1));
        const head = renderHead(), foot = renderFoot();
        if (ui.tab === 'av' && !ui.animPane && av.pane?.parentNode === ui.root && av.sig === avSig()) {
            ui.root.firstElementChild.replaceWith(head);
            ui.root.lastElementChild.replaceWith(foot);
        } else {
            ui.root.replaceChildren(head, ui.tab === 'set' ? renderSettings() : ui.tab === 'upd' ? renderUpdatePage() : ui.tab === 'av' ? renderAssets() : renderWiki(), foot);
        }
        fitNames();
        scroller.scrollTop = keep;
    }

    function fitNames() {
        for (const b of ui.root.querySelectorAll('.wk-nm b')) {
            b.style.fontSize = '';
            b.style.wordBreak = '';
            if (!b.clientWidth) continue;
            let size = parseFloat(getComputedStyle(b).fontSize);
            const min = size * 0.5;
            const over = () => b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1;
            while (size > min && over()) {
                size -= 0.5;
                b.style.fontSize = size + 'px';
            }
            if (over()) b.style.wordBreak = 'break-all';
        }
    }

    const lineSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const SVG_X = lineSvg('<path d="M18 6 6 18M6 6l12 12"/>');
    const SVG_INFO = lineSvg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>');
    const SVG_UPD = lineSvg('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>');
    const SVG_ALERT = lineSvg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>');
    
    const closeButton = () => h('button', { class: 'cw-x', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onclick: closePanel, html: SVG_X });

    function renderHead(noTabs) {
        const tab = (id, label, cls) => h('button', {
            type: 'button', class: (ui.tab === id ? 'on' : '') + (cls ? ' ' + cls : ''), 'aria-pressed': ui.tab === id ? 'true' : 'false',
            onclick: () => { if (ui.tab !== id) { ui.tab = id; render(); } },
        }, label);
        const name = noTabs ? '' : st.wiki?.wikiName;
        return h('header', { class: 'cw-head' },
            h('div', { class: 'cw-brand' }, h('i', { html: ICON_SVG }), h('b', null, name || '챠위키'), name ? h('small', null, '챠위키') : null),
            noTabs ? null : h('nav', { class: 'cw-seg', 'aria-label': '패널' }, tab('wiki', '챠위키'), tab('av', '에셋'), tab('set', '설정'),
                updOn() ? tab('upd', [h('i', { class: 'sg-ic', html: SVG_UPD }), h('span', { class: 'sg-tx' }, '업데이트'), h('i', { class: 'sg-dot', 'aria-hidden': 'true' })], 'sg-upd') : null),
            closeButton());
    }

    const upd = { latest: '', skip: '', checked: false };
    const verCmp = (a, b) => {
        const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
        return 0;
    };
    async function checkUpdate() {
        if (upd.checked) return;
        try {
            upd.skip = String(await api.pluginStorage.getItem('wiki_updSkip').catch(() => '') ?? '');
            const res = await api.nativeFetch(UPDATE_URL, { method: 'GET', headers: { Range: 'bytes=0-512' } });
            if (!res.ok) return;
            const ver = (await res.text()).match(/\/\/@version\s+(\S+)/)?.[1] ?? '';
            upd.checked = true;
            if (ver && verCmp(ver, VERSION) > 0) { upd.latest = ver; if (ui.root?.querySelector('.cw-seg')) render(); }
        } catch (error) { console.warn(LOG, 'update check', error); }
    }
    const updOn = () => !!upd.latest && upd.skip !== upd.latest;

    const UP_ICON = {
        list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
        home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
        shell: '<path d="M4 17l6-6-6-6M12 19h8"/>',
        grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
        trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
        code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
    };
    const upIcon = (k, cls) => h('span', { class: 'up-i' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', html: lineSvg(UP_ICON[k]) });
    function upHit(...kids) {
        const cur = h('span', { class: 'up-cur', 'aria-hidden': 'true', html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 2l14 10-6.2 1.2L8.6 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>' });
        return h('span', { class: 'up-hit' }, ...kids, cur);
    }
    function upStep(n, cap, sub, fig, alt) {
        return h('div', { class: 'up-step' },
            h('div', { class: 'up-cap' }, h('span', { class: 'up-n' }, String(n)), h('div', null, h('b', null, cap), sub ? h('small', null, sub) : null)),
            h('div', { class: 'up-fig', role: 'img', 'aria-label': alt }, fig));
    }
    function upSide(hitList, menu) {
        const bar = h('span', { class: 'up-ham' }, upIcon('list'));
        return h('div', { class: 'up-side' },
            hitList ? upHit(bar) : bar,
            menu ? h('div', { class: 'up-pop' }, upHit(upIcon('set')), upIcon('home'), upIcon('shell'), upIcon('grid')) : null,
            h('i', { class: 'up-av' }), h('i', { class: 'up-av' }), h('i', { class: 'up-av' }));
    }
    const upChat = () => h('div', { class: 'up-chat' }, h('i', { style: 'width:72%' }), h('i', { style: 'width:54%' }), h('i', { class: 'me', style: 'width:46%' }), h('i', { style: 'width:64%' }));

    function renderUpdatePage() {
        const pane = h('section', { class: 'cw-pane cw-upd' + (ui.animPane ? ' anim' : '') });
        const later = () => { upd.skip = upd.latest; savePref('wiki_updSkip', upd.latest); ui.tab = 'wiki'; render(); };
        const MENU = ['채팅 봇', '페르소나', '기타 봇', '소리 및 디스플레이', '언어', '접근성', '모듈', '플러그인', '계정 & 파일', '단축키'];
        const row = (name, ver, plus, dim) => h('div', { class: 'up-row' + (dim ? ' dim' : '') },
            h('span', { class: 'up-pn' }, name, h('em', null, ver)),
            upIcon('link'), plus ? upHit(upIcon('plus', 'g')) : null, upIcon('power'), upIcon('trash'));
        pane.append(
            h('div', { class: 'up-top' },
                h('div', { class: 'up-top-tx' },
                    h('b', null, `새 버전이 나왔습니다 · v${VERSION} → v${upd.latest}`),
                    h('span', null, '업데이트는 리수 설정에서 합니다. 아래 그림의 노란 테두리를 차례대로 누르세요.')),
                h('div', { class: 'up-act' },
                    h('button', { class: 'up-no', type: 'button', onclick: later }, '다음에'))),
            h('div', { class: 'up-steps' },
                upStep(1, '리수 왼쪽 위 ≡ 버튼', '이 패널을 닫으면 보입니다.',
                    h('div', { class: 'up-scr' }, upSide(true, false), upChat()), '리수 화면 왼쪽 위의 줄 세 개 버튼'),
                upStep(2, '톱니바퀴(설정)', '≡ 아래에 펼쳐진 칸의 맨 위입니다.',
                    h('div', { class: 'up-scr' }, upSide(false, true), upChat()), '≡ 아래 펼쳐진 칸 맨 위의 톱니바퀴'),
                upStep(3, '메뉴에서 「플러그인」', null,
                    h('div', { class: 'up-menu' }, MENU.map(m => m === '플러그인' ? upHit(h('span', { class: 'up-mi on' }, upIcon('code'), m)) : h('span', { class: 'up-mi' }, m))),
                    '설정 메뉴의 플러그인 항목'),
                upStep(4, '「📖 챠위키」 줄의 초록색 +', '+ 는 새 버전이 있을 때만 챠위키 이름 줄 오른쪽에 생깁니다.',
                    h('div', { class: 'up-plug' },
                        h('b', { class: 'up-pt' }, '플러그인'),
                        h('span', { class: 'up-warn' }, '악성 플러그인 설치 시 문제가 생길 수 있습니다.'),
                        h('div', { class: 'up-list' },
                            row('🎨 다른 플러그인', 'v1.0.0', false, true),
                            row('📖 챠위키', `v${VERSION}`, true, false),
                            row('📏 리사이징', 'v4.2.0', false, true))),
                    '플러그인 목록에서 챠위키 줄의 초록색 더하기 버튼'),
                upStep(5, '확인 창에서 YES', null,
                    h('div', { class: 'up-dlg' },
                        h('div', { class: 'up-box' },
                            h('p', null, '플러그인 업데이트가 발견되었습니다. 업데이트를 설치하시겠습니까?'),
                            h('div', { class: 'up-yn' }, upHit(h('span', { class: 'up-yes' }, 'YES')), h('span', { class: 'up-no2' }, 'NO')))),
                    '업데이트를 설치할지 묻는 창의 YES 버튼')),
            h('div', { class: 'up-after' },
                h('b', null, '설치가 끝나면'),
                h('ul', null,
                    h('li', null, '만들어 둔 위키와 챠위키 설정은 그대로 남습니다. 리수 플러그인 설정의 「원문 최대 글자 수」만 비워지니, 바꿔 썼다면 다시 넣어 주세요.'),
                    h('li', null, '권한을 묻는 창이 뜨면 모두 허용(YES)을 누릅니다. 거절하면 위키를 만들거나 열 수 없습니다.'))));
        return pane;
    }

    const AUDIO_MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac' };
    const VIDEO_MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
    const AV_SRC = { bot: '대표', emo: '감정', add: '추가' };
    const AV_IC = {
        find: lineSvg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
        img: lineSvg('<rect x="3" y="3" width="18" height="18"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
        audio: lineSvg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
        video: lineSvg('<rect x="2" y="5" width="15" height="14"/><path d="M17 10l5-3v10l-5-3"/>'),
        prev: lineSvg('<path d="M15 18l-6-6 6-6"/>'),
        next: lineSvg('<path d="M9 18l6-6-6-6"/>'),
        bg: lineSvg('<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-5h4v5"/>'),
        etc: lineSvg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    };
    const AV_LIMIT = 4;

    function avSig() {
        const c = st.char;
        return `${st.key}|${(st.wiki?.people ?? []).map(p => p.name + ':' + (p.face ?? '')).join(',')}|${c?.additionalAssets?.length ?? 0}|${c?.emotionImages?.length ?? 0}|${c?.image ?? ''}`;
    }

    function avPool(char) {
        const out = [];
        const seen = new Set();
        const add = (name, path, ext, src) => {
            name = String(name ?? '').trim();
            if (!name || !path) return;
            const low = name.toLowerCase();
            if (seen.has(low)) return;
            seen.add(low);
            ext = String(ext ?? '').trim().toLowerCase().replace(/^\./, '') || (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? /\.([a-z0-9]{2,5})$/i.exec(String(path))?.[1] ?? '').toLowerCase();
            const kind = !ext || IMG_EXT.test(ext) ? 'img' : AUDIO_MIME[ext] ? 'audio' : VIDEO_MIME[ext] ? 'video' : 'file';
            out.push({ i: out.length, name, low, path: String(path), ext, src, kind, toks: name.split(/[_\s]+/).filter(Boolean) });
        };
        if (char.image) add(BOT_PIC, char.image, '', 'bot');
        for (const x of char.additionalAssets ?? []) add(x?.[0], x?.[1], x?.[2], 'add');
        for (const x of char.emotionImages ?? []) add(x?.[0], x?.[1], '', 'emo');
        return out;
    }

    function avByName(items) {
        const out = [];
        const walk = (g, d) => {
            const m = new Map();
            for (const a of g) {
                const t = a.toks.length > d + 1 ? a.toks[d].toLowerCase() : '';
                if (!m.has(t)) m.set(t, []);
                m.get(t).push(a);
            }
            const big = [...m].filter(([t, s]) => t && s.length >= 3).map(([, s]) => s);
            if (d < 4 && big.length && big.reduce((n, s) => n + s.length, 0) >= g.length * 0.7) big.forEach(s => walk(s, d + 1));
            else if (d) out.push({ items: g, head: g[0].toks.slice(0, d) });
        };
        walk(items, 0);
        return out.map(({ items, head }) => {
            const short = /^[a-z]{1,3}$/.test(head[0]);
            const title = short && head.length > 1 ? head.slice(1).join(' ') : short ? head[0] + '_' : head.join(' ');
            return { items, title, sub: short && head.length === 1 ? `이름이 ${title} 로 시작하는 그림` : '이름 앞부분이 같은 그림' };
        });
    }

    function avGroups(pool, cast) {
        const q = av.q.trim().toLowerCase();
        const list = q ? pool.filter(a => a.low.includes(q)) : pool;
        const out = [];
        const used = new Set();
        const BG = /^(bg|cg|b)[_\s]/i;
        if (cast.length) {
            const vary = s => { const k = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_'); return [k, k.replace(/-/g, '')]; };
            const keys = cast.map(p => [p, [...new Set([p.id, p.name, ...(p.aliases ?? []), ...String(p.id ?? '').split(/[_\s]+/).filter(s => s.length >= 3)]
                .flatMap(vary).filter(s => s.length >= 2))]]);
            const at = (low, k) => {
                for (let i = low.indexOf(k); i >= 0; i = low.indexOf(k, i + 1)) {
                    if (i && !/[_-]/.test(low.charAt(i - 1))) continue;
                    if (/[a-z0-9]$/.test(k) && /[a-z0-9]/.test(low.charAt(i + k.length))) continue;
                    return i;
                }
                return -1;
            };
            const botName = String(st.char?.name ?? '').trim().toLowerCase();
            const self = cast.find(p => [p.name, ...(p.aliases ?? [])].some(n => String(n ?? '').trim().toLowerCase() === botName));
            const bucket = new Map(cast.map(p => [p, []]));
            for (const a of list) {
                if (a.kind !== 'img') continue;
                let owner = av.faces.get(a.low);
                if (!owner && a.src !== 'bot') {
                    const lows = vary(a.low);
                    let pos = Infinity, len = 0;
                    for (const [p, ks] of keys) for (const k of ks) for (const low of lows) {
                        const i = at(low, k);
                        if (i >= 0 && (i < pos || (i === pos && k.length > len))) { pos = i; len = k.length; owner = p; }
                    }
                    if (!owner && a.src === 'emo') owner = self;
                }
                if (!owner) continue;
                bucket.get(owner).push(a);
                used.add(a);
            }
            cast.forEach((p, n) => {
                const fl = String(p.face ?? '').toLowerCase();
                const items = bucket.get(p).sort((x, y) => (y.low === fl) - (x.low === fl));
                const face = fl && pool.find(a => a.low === fl);
                out.push({ key: 'p' + n, title: shownName(p), sub: p.role, c: colorOf(p.name), face: face || items[0], items });
            });
        }
        avByName(list.filter(a => a.kind === 'img' && a.src !== 'bot' && !used.has(a) && !BG.test(a.name))).forEach((g, n) => {
            g.items.forEach(a => used.add(a));
            out.push({ key: 'x' + n, title: g.title, sub: g.sub, c: '#8a8f93', face: g.items[0], items: g.items });
        });
        const rest = (f, key, title, sub, ic, wide) => {
            const items = list.filter(a => !used.has(a) && f(a));
            items.forEach(a => used.add(a));
            out.push({ key, title, sub, c: '#8a8f93', ic, items, wide });
        };
        rest(a => a.src === 'bot', 'bot', '봇 대표 그림', '봇 프로필 그림', AV_IC.img);
        rest(a => a.kind === 'img' && BG.test(a.name), 'bg', '배경 · CG', '이름이 bg_ · cg_ · b_ 로 시작', AV_IC.bg, true);
        rest(a => a.kind === 'img', 'etc', '그 밖의 그림', '어느 인물에도 묶이지 않은 그림', AV_IC.etc, true);
        rest(a => a.kind !== 'img', 'media', '소리 · 영상', '눌러서 들어 보기', AV_IC.audio);
        return out.filter(g => g.items.length);
    }

    function renderAssets() {
        if (av.key !== st.key) {
            for (const u of av.urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
            av.urls.clear();
            av.reading.clear();
            av.key = st.key;
            av.q = '';
        }
        av.io?.disconnect();
        av.queue.length = 0;
        const IO = (doc.defaultView ?? globalThis).IntersectionObserver;
        av.io = IO ? new IO(entries => {
            for (const e of entries) if (e.isIntersecting) { av.io.unobserve(e.target); avQueue(e.target); }
        }, { rootMargin: '400px 0px' }) : null;
        const pane = h('section', { class: 'cw-pane av' + (ui.animPane ? ' anim' : '') });
        av.pane = pane;
        av.sig = avSig();
        av.body = null;
        const char = st.char;
        if (!char) {
            pane.append(h('div', { class: 'cw-empty' },
                h('span', { class: 'cw-empty-ic muted', html: SVG_ALERT }),
                h('h2', null, '봇을 찾지 못했습니다'),
                h('p', { class: 'cw-lead' }, '에셋을 볼 봇과 채팅을 연 뒤 다시 열어 주세요.')));
            return pane;
        }
        av.pool = avPool(char);
        if (!av.pool.length) {
            pane.append(h('div', { class: 'cw-empty' },
                h('span', { class: 'cw-empty-ic', html: AV_IC.img }),
                h('h2', null, `「${char.name}」 봇에는 에셋이 없습니다`),
                h('p', { class: 'cw-lead' }, '봇 편집 화면의 에셋 칸(추가 에셋 · 감정 그림)에 넣은 그림이 여기에 보입니다.'),
                h('dl', { class: 'cw-plan' },
                    h('div', null, h('dt', null, '보여 주는 것'), h('dd', null, '추가 에셋 · 감정 그림 · 봇 대표 그림')),
                    h('div', null, h('dt', null, '보여 주지 않는 것'), h('dd', null, '모듈 에셋 · 다른 봇의 에셋')))));
            return pane;
        }
        const n = k => av.pool.filter(a => a.kind === k).length;
        const input = h('input', { type: 'search', placeholder: '에셋 이름 찾기', autocomplete: 'off', 'aria-label': '에셋 이름 찾기', value: av.q });
        const clr = h('button', {
            class: 'av-clr', type: 'button', 'aria-label': '찾는 말 지우기', title: '지우기', html: SVG_X,
            onclick: e => { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); },
        });
        clr.hidden = !av.q;
        input.addEventListener('input', () => { av.q = input.value; clr.hidden = !av.q; avFill(); });
        av.body = h('div');
        pane.append(
            h('div', { class: 'wk-top' }, h('h2', null, '봇 에셋'),
                h('span', null, '그림 ', h('b', null, String(n('img'))), ` · 소리 ${n('audio')} · 영상 ${n('video')}${n('file') ? ` · 그 밖 ${n('file')}` : ''}`)),
            h('p', { class: 'av-note' }, `「${char.name}」 봇에 들어 있는 에셋만 보여 줍니다. 보기만 하고 고치거나 지우지 않습니다.`),
            h('div', { class: 'av-bar' }, h('label', { class: 'av-find' }, h('i', { html: AV_IC.find }), input, clr)),
            av.body);
        avFill();
        return pane;
    }

    function avFill() {
        if (!av.body) return;
        av.io?.disconnect();
        av.queue.length = 0;
        const cast = (st.wiki?.people ?? []).filter(p => !p.isUser);
        av.faces = new Map(cast.filter(p => p.face).map(p => [String(p.face).toLowerCase(), p]));
        const gs = avGroups(av.pool, cast);
        const flat = gs.flatMap(g => g.items);
        const q = av.q.trim();
        const tile = a => h('button', { class: 'ga-t', type: 'button', title: a.name, onclick: () => avOpen(flat, flat.indexOf(a)) },
            avPic(a, true), h('span', { class: 'av-name' }, avMark(a.name, q)));
        const chip = g => {
            const i = g.ic ? h('i', { class: 'ic', html: g.ic }) : h('i');
            if (!g.ic && g.face) avPaint(i, g.face);
            return h('button', {
                type: 'button', style: `--c:${g.c}`, title: g.title,
                onclick: () => ui.root?.querySelector('#cw-gp-' + g.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            }, i, h('span', null, g.title), h('small', null, String(g.items.length)));
        };
        const sec = g => h('section', { class: 'gp-s', id: 'cw-gp-' + g.key, style: `--c:${g.c}` },
            h('div', { class: 'gp-h' },
                g.ic || !g.face ? h('span', { class: 'gp-sq', html: g.ic ?? AV_IC.img }) : avPic(g.face, false),
                h('div', null, h('h3', null, g.title), h('span', null, `${g.sub ? g.sub + ' · ' : ''}${g.items.length}개`))),
            h('div', { class: 'gp-g' + (g.wide ? ' wide' : '') }, g.items.map(tile)));
        const parts = [];
        if (!cast.length) parts.push(h('div', { class: 'gp-fb' }, '위키가 아직 없어 이름 앞부분이 같은 그림끼리 묶었습니다 (c_dean_smile → dean). 위키를 만들면 위키 인물별로 묶입니다.'));
        if (gs.length) parts.push(h('div', { class: 'gp-jump' }, gs.map(chip)), ...gs.map(sec));
        else parts.push(h('div', { class: 'av-none' }, `「${q}」 이름의 에셋이 없습니다.`));
        av.body.replaceChildren(...parts);
    }

    function avMark(name, q) {
        const k = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
        if (k < 0) return name;
        return [name.slice(0, k), h('span', { class: 'av-hit' }, name.slice(k, k + q.length)), name.slice(k + q.length)];
    }

    function avPic(a, tags) {
        const tg = tags ? [h('span', { class: 'av-tag ' + a.src }, AV_SRC[a.src]), av.faces.has(a.low) ? h('span', { class: 'av-tag face' }, '문서 사진') : null] : null;
        if (a.kind !== 'img') return h('span', { class: 'av-pic media' }, tg, h('i', { html: AV_IC[a.kind] ?? AV_IC.etc }), h('em', null, (a.ext || '?').toUpperCase()));
        const box = h('span', { class: 'av-pic wait' }, tg, h('img', { alt: '', decoding: 'async' }));
        const ready = avCached(a);
        if (ready) avShow(box, ready);
        else {
            av.want.set(box, a);
            if (av.io) av.io.observe(box);
            else avQueue(box);
        }
        return box;
    }

    function avPaint(el, a) {
        if (a.kind !== 'img') return;
        const put = url => { if (url) el.style.backgroundImage = `url("${url}")`; };
        const ready = avCached(a);
        if (ready) put(ready);
        else avRead(a).then(put, () => { });
    }

    function avQueue(box) {
        av.queue.push(box);
        avPump();
    }

    function avPump() {
        while (av.running < AV_LIMIT && av.queue.length) {
            const box = av.queue.shift();
            const a = av.want.get(box);
            if (!a || !box.isConnected) continue;
            av.running++;
            avRead(a).catch(() => null).then(url => {
                av.running--;
                if (url) avShow(box, url);
                else avBad(box);
                avPump();
            });
        }
    }

    function avShow(box, url) {
        const img = box.querySelector('img');
        if (!img) return;
        img.onload = () => { img.classList.add('ok'); box.classList.remove('wait'); };
        img.onerror = () => avBad(box);
        img.src = url;
    }

    function avBad(box) {
        box.classList.remove('wait');
        box.classList.add('bad');
        box.querySelector('img')?.remove();
        if (!box.querySelector('em')) box.append(h('em', null, '못 읽음'));
    }

    function avCached(a) {
        if (/^(data:|https?:|blob:)/.test(a.path)) return a.path;
        return av.urls.get(a.path) ?? st.thumbs.get(a.path) ?? null;
    }

    function avMime(a) {
        if (a.kind === 'audio') return AUDIO_MIME[a.ext];
        if (a.kind === 'video') return VIDEO_MIME[a.ext];
        if (a.kind === 'img' && a.ext) return 'image/' + (a.ext === 'jpg' ? 'jpeg' : a.ext);
        return 'image/png';
    }

    function avRead(a) {
        const ready = avCached(a);
        if (ready) return Promise.resolve(ready);
        if (av.reading.has(a.path)) return av.reading.get(a.path);
        const key = av.key;
        const job = (async () => {
            const data = await api.readImage(a.path);
            if (!data) return null;
            if (typeof data === 'string') return /^(data:|https?:|blob:)/.test(data) ? data : null;
            const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
            if (!bytes) return null;
            const url = URL.createObjectURL(new Blob([bytes], { type: avMime(a) }));
            if (av.key !== key) { URL.revokeObjectURL(url); return null; }
            av.urls.set(a.path, url);
            return url;
        })().finally(() => { if (av.key === key) av.reading.delete(a.path); });
        av.reading.set(a.path, job);
        return job;
    }

    function avOpen(list, k) {
        if (k < 0) return;
        if (!av.lbEl) av.lbFrom = doc.activeElement;
        doc.activeElement?.blur?.();
        av.lb = { list, k };
        avDrawLb();
    }

    function avStep(d) {
        if (!av.lb) return;
        const n = av.lb.list.length;
        av.lb.k = (av.lb.k + d + n) % n;
        avDrawLb();
    }

    function avCloseLb() {
        if (!av.lbEl) return;
        for (const m of av.lbEl.querySelectorAll('audio,video')) m.pause();
        av.lbEl.remove();
        const from = av.lbFrom;
        av.lb = av.lbEl = av.lbTok = av.lbFrom = null;
        if (from?.isConnected) from.focus?.({ preventScroll: true });
    }

    function avDrawLb() {
        const lb = av.lb;
        if (!lb) return;
        const a = lb.list[lb.k];
        const n = lb.list.length;
        if (av.lbEl) for (const m of av.lbEl.querySelectorAll('audio,video')) m.pause();
        else {
            av.lbEl = h('div', { class: 'cw-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': '에셋 크게 보기' });
            doc.body.append(av.lbEl);
        }
        const tok = av.lbTok = {};
        const x = h('button', { class: 'lb-x', type: 'button', 'aria-label': '닫기 (Esc)', title: '닫기 (Esc)', html: SVG_X, onclick: avCloseLb });
        const mid = h('div', { class: 'lb-mid' });
        mid.addEventListener('click', e => { if (e.target === mid) avCloseLb(); });
        const kindText = (a.ext || (a.kind === 'img' ? '그림' : '')).toUpperCase();
        const info = h('span', null, kindText);
        const fail = text => h('div', { class: 'lb-media' }, h('i', { html: AV_IC.etc }), h('span', null, text));
        const wait = h('div', { class: 'lb-wait' }, '불러오는 중…');
        mid.append(a.kind === 'file' ? fail('미리 볼 수 없는 형식입니다') : wait);
        if (n > 1) mid.append(
            h('button', { class: 'lb-nav p', type: 'button', 'aria-label': '이전 (←)', title: '이전 (←)', html: AV_IC.prev, onclick: () => avStep(-1) }),
            h('button', { class: 'lb-nav n', type: 'button', 'aria-label': '다음 (→)', title: '다음 (→)', html: AV_IC.next, onclick: () => avStep(1) }));
        if (a.kind !== 'file') avRead(a).catch(() => null).then(url => {
            if (av.lbTok !== tok) return;
            if (!url) return wait.replaceWith(fail('읽지 못했습니다'));
            if (a.kind === 'img') {
                const img = h('img', { alt: a.name });
                img.onload = () => { if (av.lbTok === tok) info.textContent = `${kindText} · ${img.naturalWidth}×${img.naturalHeight}`; };
                img.onerror = () => { if (av.lbTok === tok) img.replaceWith(fail('읽지 못했습니다')); };
                img.src = url;
                wait.replaceWith(img);
            } else if (a.kind === 'audio') {
                wait.replaceWith(h('div', { class: 'lb-media' }, h('i', { html: AV_IC.audio }), h('audio', { controls: '', preload: 'metadata', src: url })));
            } else {
                wait.replaceWith(h('video', { controls: '', playsinline: '', preload: 'metadata', src: url }));
            }
        });
        const owner = av.faces.get(a.low);
        const cp = h('button', {
            class: 'cp', type: 'button',
            onclick: () => avToast(copyText(a.name)
                ? `「${a.name.length > 24 ? a.name.slice(0, 24) + '…' : a.name}」 이름을 복사했습니다`
                : '복사가 막혔습니다. 위쪽 이름을 직접 골라 복사해 주세요.'),
        }, '이름 복사');
        av.lbEl.replaceChildren(
            h('div', { class: 'lb-top' }, h('b', null, a.name), h('span', null, `${lb.k + 1} / ${n}`), x),
            mid,
            h('div', { class: 'lb-bot' },
                h('span', { class: 'av-tag ' + a.src }, AV_SRC[a.src]),
                owner ? h('span', { class: 'av-tag face' }, `${shownName(owner)} 문서 사진`) : null,
                info, h('span', { class: 'sp' }), cp));
        x.focus();
    }

    function avToast(text) {
        if (!av.toast?.isConnected) {
            av.toast = h('div', { class: 'av-toast', role: 'status' });
            doc.body.append(av.toast);
        }
        av.toast.textContent = text;
        void av.toast.offsetWidth;
        av.toast.classList.add('on');
        clearTimeout(av.toastTimer);
        av.toastTimer = setTimeout(() => av.toast?.classList.remove('on'), 1600);
    }

    function renderFoot() {
        if (ui.tab === 'av') return h('footer', { class: 'cw-foot' }, h('span', null, `챠위키 v${VERSION} · 에셋 보기는 모델을 부르지 않습니다`));
        return h('footer', { class: 'cw-foot' },
            h('span', null, `챠위키 v${VERSION} · ${modelLabel()}로 작성`),
            h('span', { class: 'nw-copy' }, editStamp(), copyButton()));
    }

    function copyButton() {
        if (ui.tab !== 'wiki' || !st.wiki) return null;
        const msg = h('span');
        return h('span', { class: 'nw-copy-in' }, msg, h('button', {
            type: 'button', title: '보이는 모양(색 · 표 · 사진)을 그대로 복사한다. 붙여 넣는 곳이 서식을 받아야 모양이 남는다.',
            onclick: () => {
                const article = ui.root?.querySelector('.wk-d');
                if (article) void copyDoc(article, msg);
            },
        }, '이 문서 복사'));
    }

    function renderActions() {
        const busy = st.busy;
        const has = !!st.wiki;
        if (has && !busy) return null;
        return h('div', { class: 'cw-acts' },
            busy
                ? h('button', { class: 'cw-btn', type: 'button', onclick: () => stopBusy(busy) }, '■ 중단')
                : h('button', { class: 'cw-btn date', type: 'button', disabled: !st.char, onclick: () => void generateAll() }, '📖 위키 만들기'));
    }

    const TIPS = [
        '「이 문서 다시 쓰기」로 한 사람 문서만 새로 씁니다.',
        '회색 막대는 스포일러입니다. 누르면 내용이 보입니다.',
        '사진이 틀리면 문서 위 「이미지 다시 찾기」로 새로 고릅니다.',
        '「■ 중단」을 눌러도 다 쓴 문서는 남습니다.',
        'gemini-flash-lite 모델은 더 빠르지만 품질이 떨어질 수 있습니다.',
    ];
    const TIP_MS = 4500;
    const SHINE_MS = 1600;

    function busySpan(b) {
        if (b.span) return b.span;
        if (!b.total) return [0, 0.9];
        const base = b.base ?? 0;
        const at = n => base + (1 - base) * Math.min(1, n / b.total);
        return [at(b.done), at(b.done + (b.step ?? 1))];
    }

    function gaugeStyle(b, now) {
        const [from, to] = busySpan(b);
        const mark = `${from}:${to}`;
        if (b.mark !== mark) { b.mark = mark; b.t0 = now; }
        const pct = x => (x * 100).toFixed(2) + '%';
        return `--from:${pct(from)};--to:${pct(from + (to - from) * 0.9)};--shine:-${now % SHINE_MS}ms;animation-delay:-${now - b.t0}ms`;
    }

    function renderMessages() {
        const out = [];
        if (st.busy) {
            const b = st.busy;
            const now = Date.now();
            out.push(h('div', { class: 'cw-msg' }, h('div', { class: 'cw-prog' },
                h('span', null, b.label + (b.total ? ` (${b.done}/${b.total})` : '') + '…'),
                h('div', { class: 'tr' }, h('div', { class: 'fi', style: gaugeStyle(b, now) }))),
                b.stop ? null : h('div', { class: 'cw-prog-note' }, '위키 창을 닫아도 됩니다. 리수를 켜 두면 백그라운드에서 끝까지 쓰고 저장합니다.'),
                b.stop ? null : h('div', { class: 'cw-tip' }, h('b', null, 'TIP'),
                    h('div', { class: 'cw-tip-box' }, TIPS.map((tip, i) => h('span', { style: `animation-delay:${i * TIP_MS - now % (TIP_MS * TIPS.length)}ms` }, tip))))));
        }
        if (st.error) out.push(h('div', { class: 'cw-msg err' }, '⚠ ' + st.error));
        if (st.status && !st.busy) out.push(h('div', { class: 'cw-msg' }, st.status));
        return out;
    }

    let rebuildArm = false;
    let rebuildTimer = null;
    function rebuildButton() {
        return h('button', {
            class: 'cw-btn ' + (rebuildArm ? 'arm' : 'danger'), type: 'button', disabled: !st.char,
            title: rebuildArm ? '지금 위키를 지우고 처음부터 다시 만든다' : '',
            onclick: () => {
                clearTimeout(rebuildTimer);
                if (rebuildArm) {
                    rebuildArm = false;
                    st.status = '';
                    return void generateAll(true);
                }
                rebuildArm = true;
                st.status = '';
                st.error = '';
                rebuildTimer = setTimeout(() => { rebuildArm = false; render(); }, 5000);
                render();
            },
        }, rebuildArm ? '한 번 더 누르면 다시 만듭니다' : '↻ 다시 만들기');
    }

    const callNote = () => `인물 목록 1번 + 대표 사진 고르기 1번 + 세계관 1번 + 인물 ${st.batch}명마다 1번${st.batch > 1 ? '(빠진 사람은 따로 1번씩)' : ''}${userInputs(st.char) >= USER_MIN ? ' + 유저 문서 1번' : ''} (실패하면 저마다 ${RETRIES}번까지 다시 부름)`;

    function renderWiki() {
        const pane = h('section', { class: 'cw-pane' + (ui.animPane ? ' anim' : '') });
        const w = st.wiki;
        if (!st.char || !w) {
            pane.append(h('div', null, st.busy ? renderActions() : null, renderMessages()), renderEmpty());
            return pane;
        }
        const cast = w.people.filter(p => !p.isUser);
        const done = cast.filter(p => p.article).length;
        pane.append(
            h('div', { class: 'wk-top' }, h('h2', null, '인물 문서'), h('span', null, '작성 ', h('b', null, String(done)), ` / ${cast.length}`,
                done < cast.length && !st.busy ? h('button', {
                    class: 'cw-btn wk-resume', type: 'button', disabled: !st.char, onclick: () => void resumeAll(),
                    title: `아직 쓰지 않은 ${cast.length - done}명의 문서만 위키 차례대로 쓴다. 이미 쓴 문서는 그대로 둔다.`,
                }, `▶ 이어 쓰기 (${cast.length - done}명)`) : null)),
            h('div', null, renderActions(), renderMessages()),
            h('div', { class: 'wk' }, renderList(), renderDoc()));
        return pane;
    }

    function renderEmpty() {
        if (!st.char) {
            return h('div', { class: 'cw-empty' },
                h('span', { class: 'cw-empty-ic muted', html: SVG_ALERT }),
                h('h2', null, '봇을 찾지 못했습니다'),
                h('p', { class: 'cw-lead' }, '위키를 만들 봇과 채팅을 연 뒤 다시 열어 주세요.'));
        }
        const busy = !!st.busy;
        const picked = SOURCES.filter(s => st.picked[s.id]).map(s => s.label);
        return h('div', { class: 'cw-empty' },
            h('span', { class: 'cw-empty-ic', html: ICON_SVG }),
            h('h2', null, `「${st.char.name}」의 위키가 아직 없습니다`),
            h('p', { class: 'cw-lead' }, busy
                ? '위키를 만드는 중입니다. 인물 목록이 나오면 이 자리에 차례로 나타납니다.'
                : '봇 설명과 로어북을 읽고 세계관 문서와 인물 문서를 씁니다. 다 쓴 문서는 이 봇의 위키로 저장됩니다.'),
            busy ? null : h('button', { class: 'cw-btn date lg', type: 'button', onclick: () => void generateAll() }, '📖 위키 만들기'),
            h('dl', { class: 'cw-plan' },
                h('div', null, h('dt', null, '분석 모델'), h('dd', null, modelLabel())),
                h('div', null, h('dt', null, '분석할 곳'), h('dd', null, picked.length ? picked.join(' · ') : '없음')),
                h('div', null, h('dt', null, '분석할 채팅 수'), h('dd', null, `최근 ${st.userChat}개`))),
            busy ? null : h('button', { class: 'cw-link', type: 'button', onclick: () => { ui.tab = 'set'; render(); } }, '설정에서 바꾸기 →'));
    }

    function noteBlock(k, short, more) {
        return [
            short ? h('p', null, short) : null,
            more ? h('details', { open: ui.det.has(k), ontoggle: e => { if (e.target.open) ui.det.add(k); else ui.det.delete(k); } },
                h('summary', null, '자세히'), h('p', null, more)) : null,
        ];
    }


    function switchRow({ k, label, short, more, on, onToggle }) {
        return h('div', { class: 'cf-row sw' },
            h('div', { class: 'cf-tx' }, h('b', null, label), noteBlock(k, short, more)),
            h('button', { type: 'button', class: 'cf-tg' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, onclick: onToggle },
                h('span', { class: 'cf-tg-lb' }, on ? '켜짐' : '꺼짐'), h('span', { class: 'cf-tg-tr' }, h('i'))));
    }

    function pickRow({ k, label, short, more, options, value, rec, free, onPick }) {
        return h('div', { class: 'cf-row' },
            h('div', { class: 'cf-tx' }, h('b', null, label, rec ? h('span', { class: 'cf-rec' }, rec) : null), noteBlock(k, short, more)),
            h('div', { class: 'cf-seg', role: 'group', 'aria-label': label }, options.map(([v, text]) =>
                h('button', { type: 'button', class: v === value ? 'sel' : '', 'aria-pressed': v === value ? 'true' : 'false', disabled: !!st.busy && !free, onclick: () => { if (v !== value) onPick(v); } }, text))));
    }

    const savePref = (key, value) => void api.pluginStorage.setItem(key, value).catch(() => {});

    let extraTimer = null;

    function renderModelPrefs() {
        return h('div', { class: 'cf-card' },
            pickRow({ k: 'model', label: '분석 모델', rec: 'gemini-flash 권장',
                short: '리수 설정에서 고른 메인 모델 또는 보조 모델로 원문을 분석해 문서를 쓴다.', more: '바꾼 값은 다음 요청부터 적용된다.',
                options: [['model', '메인 모델'], ['submodel', '보조 모델']], value: st.model, onPick: v => {
                    st.model = v;
                    savePref('wiki_model', v);
                    render();
                } }),
            pickRow({ k: 'batch', label: '한 번에 분석할 인물 수',
                short: '모델을 한 번 부를 때 몇 명을 함께 분석할지 고른다.', more: '많을수록 호출이 줄지만 응답이 길어 끊기기 쉽고, 한 사람 몫의 원문은 줄어든다.',
                options: BATCHES.map(n => [n, `${n}명`]), value: st.batch, onPick: v => {
                    st.batch = v;
                    savePref('wiki_batch', v);
                    render();
                } }),
            pickRow({ k: 'lang', label: '문서 언어',
                short: '인물 목록 · 세계관 · 인물 문서를 이 언어로 쓴다.', more: '바꾸면 다음에 쓰는 문서부터 적용되고, 이미 쓴 문서는 다시 쓰기 전까지 그대로다. 인물 이름은 원문 표기를 그대로 쓴다.',
                options: LANGS, value: st.lang, onPick: v => {
                    st.lang = v;
                    savePref('wiki_lang', v);
                    render();
                } }),
            h('div', { class: 'cf-row' },
                h('div', { class: 'cf-tx' }, h('b', null, '분석할 채팅 수'),
                    noteBlock('userchat', `유저 문서를 쓸 때 이 채팅의 최근 메시지를 몇 개까지 보낼지 정한다. 기본 ${USER_CHAT_DEF}개.`,
                        `유저 입력과 봇 응답을 합친 수이고, 내용이 빈 메시지는 세지 않는다. 페르소나 설명은 따로 함께 보낸다. 늘리면 오래된 행적까지 읽지만 요청이 길어진다. 1~${USER_CHAT_TOP} 사이로 적는다.`)),
                h('input', {
                    class: 'cf-num', type: 'number', min: '1', max: String(USER_CHAT_TOP), step: '1', inputmode: 'numeric',
                    value: String(st.userChat), disabled: !!st.busy, 'aria-label': '분석할 채팅 수',
                    onchange: e => {
                        st.userChat = userChatNum(e.target.value);
                        e.target.value = String(st.userChat);
                        savePref('wiki_userchat', st.userChat);
                    },
                })),
            h('div', { class: 'cf-row col' },
                h('div', { class: 'cf-tx' }, h('b', null, '추가 지시'),
                    noteBlock('extra', '원문(봇 설명 · 로어북) 바로 위에 붙여 보낸다.')),
                h('textarea', {
                    class: 'cf-ta', rows: '4', disabled: !!st.busy, 'aria-label': '추가 지시',
                    placeholder: '예) 유저 캐릭터 「한결」도 인물로 넣어라. / 성격 문단은 길게 써라.',
                    oninput: e => {
                        st.extra = e.target.value;
                        clearTimeout(extraTimer);
                        extraTimer = setTimeout(() => savePref('wiki_extra', st.extra), 400);
                    },
                }, st.extra)));
    }

    function renderSettings() {
        const dropped = st.wiki?.dropped;
        const denied = st.inputBtn && inBtn.asked && !inBtn.doc;
        return h('section', { class: 'cw-pane' + (ui.animPane ? ' anim' : '') },
            h('div', { class: 'cf-warn' }, h('i', { html: SVG_INFO }), h('span', null, '어떤 설정인지 모르겠으면, 바꾸지 마세요')),
            h('section', { class: 'cf-grp' }, h('h2', null, '보기'),
                h('div', { class: 'cf-card' },
                    switchRow({ k: 'reveal', label: '스포일러 모두 보기', short: '가려 둔 정체 · 반전 · 비밀을 한꺼번에 펼친다.',
                        on: st.revealAll, onToggle: () => { st.revealAll = !st.revealAll; render(); } }),
                    pickRow({ k: 'font', label: '글자 크기', short: '문서와 설정 화면의 글자 크기. 저장되어 다음에 열 때도 유지된다.', free: true,
                        options: FONTS, value: st.font, onPick: v => {
                            st.font = v;
                            savePref('wiki_font', v);
                            render();
                        } }),
                    switchRow({ k: 'inbtn', label: '챠위키 버튼을 입력칸 옆에도 두기', on: st.inputBtn,
                        short: denied
                            ? '「본문 화면 접근」을 허용하지 않아 버튼을 달지 못했다. 리수를 다시 열면 다시 묻는다. 왼쪽 사이드바 ☰ 메뉴와 채팅 ≡ 메뉴의 챠위키는 그대로 쓸 수 있다.'
                            : '왼쪽 사이드바 ☰ 메뉴와 채팅 ≡ 메뉴에 있는 챠위키 버튼을 채팅 입력칸 왼쪽에도 하나 더 둔다.',
                        more: '',
                        onToggle: () => void toggleInputButton() }))),
            h('section', { class: 'cf-grp' }, h('h2', null, '분석할 곳'),
                h('p', { class: 'cf-note' }, '위키를 만들 때 모델에게 보낼 곳. 바꾼 값은 다음에 만들 때부터 적용된다.'),
                h('div', { class: 'cf-card cols' }, SOURCES.map(s => switchRow({ k: 'src-' + s.id, label: s.label, short: s.note,
                    on: !!st.picked[s.id], onToggle: () => {
                        st.picked[s.id] = !st.picked[s.id];
                        savePref('wiki_sources', { ...st.picked });
                        render();
                    } }))),
                dropped ? h('p', { class: 'cf-hint' }, `지난번에는 원문이 길어 ${dropped}개 항목을 덜 읽었다. 플러그인 설정의 source_limit 으로 늘릴 수 있다.`) : null),
            h('section', { class: 'cf-grp' }, h('h2', null, '모델과 지시'), renderModelPrefs()),
            st.wiki ? renderRebuild() : null,
            renderDev());
    }

    function copyText(text) {
        const ta = doc.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.setAttribute('style', 'position:fixed;left:-99999px;top:0');
        doc.body.append(ta);
        ta.select();
        let ok = false;
        try { ok = doc.execCommand('copy'); } catch { }
        ta.remove();
        return ok;
    }
    function renderDev() {
        const msg = h('span', { class: 'cf-dev-msg', role: 'status', 'aria-live': 'polite' });
        const copied = '새 창이 막혀 주소를 복사했습니다. 브라우저 주소창에 붙여 넣어 주세요.';
        const go = async () => {
            let w = null;
            try { w = window.open(DEV_URL, '_blank'); } catch { }
            if (w) { try { w.opener = null; } catch { } return; }
            if (copyText(DEV_URL)) { msg.textContent = copied; return; }
            try { await navigator.clipboard.writeText(DEV_URL); msg.textContent = copied; }
            catch { msg.textContent = `새 창과 복사가 모두 막혔습니다. 주소: ${DEV_URL}`; }
        };
        return h('div', { class: 'cf-dev' },
            h('span', { class: 'cf-dev-gh', 'aria-hidden': 'true', html: GH_SVG }),
            h('div', { class: 'cf-dev-tx' },
                h('small', null, 'MADE BY'),
                h('b', null, DEV_URL.replace(/^https:\/\/github\.com\//, '')),
                h('span', null, '신버전과 다른 작업을 깃허브에서 볼 수 있습니다.'),
                msg),
            h('button', { class: 'cf-dev-go', type: 'button', onclick: go }, '깃허브 열기 ↗'));
    }

    function renderRebuild() {
        const busy = st.busy;
        return h('section', { class: 'cf-grp' }, h('h2', null, '챠위키'),
            h('div', { class: 'cf-card danger' },
                h('div', { class: 'cf-row' },
                    h('div', { class: 'cf-tx' }, h('b', null, '처음부터 다시 만들기'),
                        h('p', null, '지금 위키를 지우고 인물 목록부터 다시 쓴다.'),
                        h('p', { class: 'cost' }, `${modelLabel()}을 ${callNote()} 부른다.`)),
                    busy
                        ? h('button', { class: 'cw-btn', type: 'button', onclick: () => stopBusy(busy) }, '■ 중단')
                        : rebuildButton())),
            renderMessages());
    }

    function personMeta(p) {
        if (p.isUser && !p.article) {
            const n = userInputs(st.char);
            return p.error ? '작성 실패' : n < USER_MIN ? `유저 입력 ${n} / ${USER_MIN}회 (${USER_MIN}회 이상 채팅하면 쓸 수 있음)` : '유저 문서 쓰기 가능';
        }
        if (st.busy && !p.article && !p.error) return '작성 대기';
        if (p.error && !p.article) return '작성 실패';
        return p.role || '';
    }

    function mainTitle(name, en) {
        if (en) return /^the world of /i.test(name) ? name : `The World of ${name}`;
        return /세계관$/.test(name) ? name : `${name} 세계관`;
    }

    const SVG_SIL = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="39" r="19"/><path d="M14 100c0-24 16-38 36-38s36 14 36 38z"/></svg>';
    function defaultFace(big) {
        return h('span', { class: (big ? 'nw-df' : 'wk-face') + ' df-sil', html: SVG_SIL });
    }

    function shownName(p) {
        if (p.isUser) return p.name;
        const all = [p.name, ...(p.aliases ?? [])].map(n => String(n).trim()).filter(Boolean);
        if (st.lang === 'en') {
            const latin = all.find(n => /[a-z]/i.test(n) && LATIN.test(n));
            if (!latin) return p.name;
            return latin === latin.toLowerCase() ? latin.replace(/(^|[\s_-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : latin;
        }
        return all.find(n => /[\uac00-\ud7a3]/.test(n)) ?? p.name;
    }

    function quoteName(p, a) {
        if (st.lang === 'en' && !p.isUser && a.original && LATIN.test(a.original)) return a.original;
        return p.isUser ? a.title : shownName(p);
    }

    function renderList() {
        const w = st.wiki;
        const rows = [h('button', {
            type: 'button', title: '세계관', class: 'wk-row' + (st.sel === '__main' ? ' sel' : ''), onclick: () => select('__main'),
        }, h('span', { class: 'wk-face home' }, '❖'), h('span', { class: 'wk-nm' }, h('b', null, '세계관')))];
        for (const p of w.people) {
            const pic = st.portraits.get(pid(p)) ?? refinding.get(pid(p));
            if (!st.portraits.has(pid(p))) void loadPortrait(p);
            const missing = !p.article;
            rows.push(h('button', {
                type: 'button', title: p.isSpoiler && !st.revealAll ? p.name : [p.name, personMeta(p)].filter(Boolean).join(' — '),
                class: 'wk-row' + (st.sel === p.name ? ' sel' : '') + (missing ? ' unmet' : '') + (missing && !p.error ? ' wait' : '') + (p.error && missing ? ' bad' : ''),
                style: `--tc:${colorOf(p.name)}`, onclick: () => select(p.name),
            },
            p.isSpoiler ? h('span', { class: 'sp-dot' }, '스포') : null,
            pic ? h('span', { class: 'wk-face pic' }, h('img', { src: pic, alt: '' })) : defaultFace(),
            h('span', { class: 'wk-nm' }, h('b', null, shownName(p)))));
        }
        return h('nav', { class: 'wk-list', 'aria-label': '인물' }, rows);
    }

    function select(name, toDoc = false) {
        st.sel = name;
        render();
        if (!toDoc) return;
        const d = ui.root?.querySelector('.wk-d');
        if (d && d.getBoundingClientRect().top < 0) d.scrollIntoView({ block: 'start' });
    }

    function editStamp() {
        const t = st.wiki?.updatedAt ? new Date(st.wiki.updatedAt) : null;
        return t ? `최근 수정 시각: ${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
    }

    function renderDoc() {
        const p = st.sel === '__main' ? null : st.wiki.people.find(x => x.name === st.sel);
        const el = p ? renderArticle(p) : renderMain();
        keepSpoilers(el, p ? p.article : st.wiki.world);
        if (ui.animDoc) el.classList.add('anim');
        return el;
    }

    function keepSpoilers(el, ref) {
        if (ui.spRef !== ref) {
            ui.spRef = ref;
            ui.spOpen = new Set();
        }
        el.querySelectorAll('.nw-spw').forEach((w, i) => {
            w.dataset.sp = 'b' + i;
            if (ui.spOpen.has(w.dataset.sp)) w.querySelector('.nw-spbox')?.click();
        });
        el.querySelectorAll('.nw-sp').forEach((sp, i) => {
            sp.dataset.sp = 's' + i;
            if (ui.spOpen.has(sp.dataset.sp)) sp.classList.add('open');
        });
    }

    function finishDoc(article, ctx) {
        if (ctx.notes.length) {
            article.append(h('section', { class: 'nw-fn' }, h('h4', null, '각주'), h('ol', null,
                ctx.notes.map((n, i) => h('li', { id: `cw-fn-${i + 1}` }, h('span', null, `[${i + 1}]`), ' ',
                    h('span', { html: n.spoiler ? `<span class="nw-sp${st.revealAll ? ' open' : ''}">${n.body}</span>` : n.body }))))));
        }
        return article;
    }

    const COPY_PROPS = [
        'display', 'float', 'clear', 'box-sizing', 'max-width', 'vertical-align',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border-top', 'border-right', 'border-bottom', 'border-left', 'border-collapse',
        'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'letter-spacing', 'text-align', 'text-decoration-line', 'white-space', 'word-break',
        'list-style-type', 'object-fit',
        'flex-wrap', 'justify-content', 'align-items', 'row-gap',
    ];
    const COPY_SKIP = new Set(['none', 'normal', 'auto', '0px', 'start', 'baseline', 'rgba(0, 0, 0, 0)', 'content-box', 'separate', 'fill']);
    const KEEP_ZERO = /^(OL|UL|LI|P|H[1-6]|BLOCKQUOTE|DL|DD|FIGURE)$/;
    const ZERO_PROPS = /^(margin|padding)-|^list-style-type$/;
    const FLEX_PROPS = /^(flex-wrap|justify-content|align-items|row-gap)$/;
    const SP_BG = '#55595c';

    function styleFor(el) {
        const cs = getComputedStyle(el);
        const out = [];
        const keepZero = KEEP_ZERO.test(el.tagName);
        for (const prop of COPY_PROPS) {
            const v = cs.getPropertyValue(prop);
            if (!v) continue;
            if (FLEX_PROPS.test(prop) && !/flex$/.test(cs.display)) continue;
            if (!(keepZero && ZERO_PROPS.test(prop)) && (COPY_SKIP.has(v) || /^0px (none|solid)/.test(v) || /^(0px )?none /.test(v))) continue;
            if (prop === 'display' && /^(block|inline|table|table-row|table-cell|list-item|table-row-group)$/.test(v) && v === defaultDisplay(el)) continue;
            out.push(`${prop}:${v}`);
        }
        const parent = el.parentElement;
        if (parent && /flex$/.test(getComputedStyle(parent).display) && parseFloat(cs.flexGrow) > 0) out.push(`flex:${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}`);
        const pcs = parent && el.previousElementSibling ? getComputedStyle(parent) : null;
        if (pcs && /flex$/.test(pcs.display) && !/column/.test(pcs.flexDirection)) {
            const gap = parseFloat(pcs.columnGap) || 0;
            if (gap > 0) {
                const i = out.findIndex(x => x.startsWith('margin-left:'));
                if (i >= 0) out.splice(i, 1);
                const own = parseFloat(cs.marginLeft) || 0;
                out.push(own > 40 ? 'margin-left:auto' : `margin-left:${own + gap}px`);
            }
        }
        if (/^(TABLE|IMG)$/.test(el.tagName) || el.classList.contains('nw-box')) out.push(`width:${cs.width}`);
        if (el.tagName === 'IMG') out.push(`height:auto`);
        return out;
    }

    function defaultDisplay(el) {
        return { SPAN: 'inline', B: 'inline', I: 'inline', A: 'inline', SUP: 'inline', SMALL: 'inline', EM: 'inline', DEL: 'inline', TABLE: 'table', TR: 'table-row', TD: 'table-cell', TH: 'table-cell', TBODY: 'table-row-group', LI: 'list-item' }[el.tagName] ?? 'block';
    }

    function pseudoSpan(el, which) {
        const cs = getComputedStyle(el, which);
        const m = /^"(.+)"$/.exec(cs.content);
        if (!m) return null;
        const s = doc.createElement('span');
        s.textContent = m[1];
        s.setAttribute('style', `margin:${cs.margin};color:${cs.color};opacity:${cs.opacity}`);
        return s;
    }

    function docHtml(article) {
        const clone = article.cloneNode(true);
        const src = [article, ...article.querySelectorAll('*')];
        const dst = [clone, ...clone.querySelectorAll('*')];
        const fix = [];
        src.forEach((el, i) => {
            const c = dst[i];
            const style = styleFor(el);
            if (el.closest('.nw-sp:not(.open)')) style.push(`color:${SP_BG}`, `background-color:${SP_BG}`);
            c.setAttribute('style', style.join(';'));
            fix.push([c, pseudoSpan(el, '::before'), pseudoSpan(el, '::after')]);
        });
        for (const [c, before, after] of fix) {
            if (before) c.prepend(before);
            if (after) c.append(after);
        }
        clone.querySelectorAll('.nw-edit button, .nw-copy').forEach(el => el.remove());
        clone.querySelectorAll('button').forEach(b => {
            const d = doc.createElement('div');
            d.setAttribute('style', b.getAttribute('style') ?? '');
            d.append(...b.childNodes);
            b.replaceWith(d);
        });
        clone.querySelectorAll('*').forEach(el => {
            if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
            for (const a of [...el.attributes]) if (a.name !== 'style' && a.name !== 'src' && a.name !== 'alt' && a.name !== 'colspan') el.removeAttribute(a.name);
        });
        clone.removeAttribute('class');
        clone.style.maxWidth = Math.ceil(article.getBoundingClientRect().width) + 'px';
        const plain = article.cloneNode(true);
        plain.querySelectorAll('.nw-sp:not(.open)').forEach(s => { s.textContent = '(스포일러)'; });
        plain.querySelectorAll('.nw-edit button, .nw-copy, .nw-spbox').forEach(el => el.remove());
        plain.setAttribute('style', 'position:fixed;left:-99999px;top:0;width:' + clone.style.maxWidth);
        doc.body.append(plain);
        const text = plain.innerText.replace(/\n{3,}/g, '\n\n').trim();
        plain.remove();
        return { html: clone.outerHTML, text };
    }

    async function copyDoc(article, msg) {
        const say = (cls, t) => { msg.className = cls; msg.textContent = t; };
        let out;
        try {
            out = docHtml(article);
        } catch (error) {
            console.warn(LOG, 'copy', error);
            return say('no', '복사할 문서를 만들지 못했습니다.');
        }
        let ok = false;
        const onCopy = e => {
            e.clipboardData.setData('text/html', out.html);
            e.clipboardData.setData('text/plain', out.text);
            e.preventDefault();
            ok = true;
        };
        const ta = doc.createElement('textarea');
        ta.value = out.text;
        ta.setAttribute('style', 'position:fixed;left:-99999px;top:0');
        doc.body.append(ta);
        ta.select();
        doc.addEventListener('copy', onCopy, true);
        try { doc.execCommand('copy'); } catch { }
        doc.removeEventListener('copy', onCopy, true);
        ta.remove();
        if (ok) return say('ok', '복사했습니다. 서식을 받는 편집기에 붙여 넣으세요.');
        try {
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([out.html], { type: 'text/html' }),
                'text/plain': new Blob([out.text], { type: 'text/plain' }),
            })]);
            return say('ok', '복사했습니다. 서식을 받는 편집기에 붙여 넣으세요.');
        } catch (error) {
            console.warn(LOG, 'clipboard', error);
        }
        const name = (article.querySelector('.nw-title')?.textContent || '챠위키').replace(/[\\/:*?"<>|]/g, '_');
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title>${out.html}`], { type: 'text/html' }));
        a.download = name + '.html';
        doc.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        say('no', '클립보드가 막혀 있어 HTML 파일로 내려받았습니다.');
    }

    function renderMain() {
        const w = st.wiki;
        const ctx = { notes: [], spoiler: false };
        const en = (w.worldLang ?? w.lang) === 'en';
        const secs = w.world?.length ? w.world : [{
            title: en ? 'Overview' : '개요', items: [], spoiler: false,
            paragraphs: w.summary.length ? w.summary : [en ? `A wiki about the world of ${w.botName}.` : `${w.botName}의 세계를 정리한 위키다.`],
        }];
        const { toc, body } = renderSections(secs, ctx);
        const n = secs.length + 1;
        const cast = en ? 'Characters' : '등장인물';
        const listed = w.people.filter(p => !p.isUser || p.article);
        if (listed.length) toc.querySelector('ol').append(h('li', { 'data-sec': n }, h('a', null, `${n}.`), ' ', cast));
        const art = h('article', { class: 'wk-d', style: '--tc:var(--rose)' },
            h('header', { class: 'nw-hd' }, h('h3', { class: 'nw-title' }, mainTitle(w.wikiName, en)), h('span', { class: 'nw-edit' }, editStamp(), mainButton())),
            catRow(w.categories),
            h('div', { class: 'nw-top' }, toc),
            body,
            listed.length ? h('section', { class: 'nw-s', id: `cw-sec-${n}` }, h('h4', { class: 'nw-h' }, h('a', null, `${n}.`), ' ', cast),
                h('table', { class: 'nw-idx' }, h('tbody', null, listed.map(p => {
                    const hide = p.isSpoiler && !st.revealAll;
                    return h('tr', { style: `--tc:${colorOf(p.name)}` },
                        h('th', null, h('i'), h('span', { class: 'nw-a', 'data-go': p.name }, shownName(p))),
                        h('td', null, hide ? h('span', { class: 'nw-sp', html: esc(p.role) }) : p.role));
                })))) : null,
            w.worldError ? h('div', { class: 'nw-err' }, '세계관 문서 작성 실패: ' + w.worldError) : null,
        );
        return finishDoc(art, ctx);
    }

    function renderSections(sections, ctx) {
        const toc = h('nav', { class: 'nw-toc' }, h('b', null, '목차'), h('ol', null, sections.map((s, i) =>
            h('li', { 'data-sec': i + 1 }, h('a', null, `${i + 1}.`), ' ', s.title, s.spoiler ? h('small', null, '스포') : null))));
        const body = sections.map((s, i) => {
            ctx.spoiler = s.spoiler;
            const lines = [];
            for (const t of s.paragraphs) lines.push(h('div', { class: 'nw-p', html: inline(t, ctx) }));
            if (s.items.length) {
                lines.push(h('ul', { class: 'nw-ul' }, s.items.map(t => {
                    const m = t.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
                    return m ? h('li', { class: 'nw-dl' }, h('b', { html: inline(m[1], ctx) }), h('span', { html: inline(m[2], ctx) }))
                        : h('li', { html: inline(t, ctx) });
                })));
            }
            ctx.spoiler = false;
            const inner = h('div', null, lines);
            return h('section', { class: 'nw-s', id: `cw-sec-${i + 1}` },
                h('h4', { class: 'nw-h' }, h('a', null, `${i + 1}.`), ' ', s.title, s.spoiler ? h('span', { class: 'nw-sp-tag' }, '스포') : null),
                s.spoiler ? spoilerBlock(`「${s.title}」`, inner) : inner);
        });
        return { toc, body };
    }

    function renderArticle(p) {
        const tc = colorOf(p.name);
        const a = p.article;
        if (!a) {
            return h('article', { class: 'wk-d nw-none', style: `--tc:${tc}` },
                h('header', { class: 'nw-hd' }, h('h3', { class: 'nw-title' }, shownName(p)), h('span', { class: 'nw-edit' }, '문서 없음', articleButton(p))),
                h('div', { class: 'nw-nf' }, p.isUser ? userNote() : st.busy ? '이 문서는 아직 쓰는 중이거나 차례를 기다리고 있다.' : '아직 쓰지 않은 문서다.'),
                h('div', { class: 'nw-nf2' }, p.isUser ? '' : p.role || ''),
                p.error ? h('div', { class: 'nw-err' }, '작성 실패: ' + p.error) : null);
        }
        const ctx = { notes: [], spoiler: false };
        const pic = st.portraits.get(pid(p)) ?? refinding.get(pid(p)) ?? null;
        const rows = [h('tr', null, h('td', { colspan: 2, class: 'nw-bh' },
            h('b', null, a.title), a.original ? h('small', null, a.original) : null, a.nickname ? h('em', { html: inline(a.nickname, ctx) }) : null))];
        rows.push(h('tr', null, h('td', { colspan: 2, class: 'nw-bp' + (pic ? '' : ' nw-bp0') }, pic ? h('img', { src: pic, alt: a.title }) : defaultFace(true))));
        for (const r of a.infobox) {
            if (r.spoiler && !st.revealAll) {
                ctx.spoiler = true;
                const html = inline(r.value, ctx).replace(/\n/g, '<br>');
                ctx.spoiler = false;
                const td = h('td', { title: '스포일러 — 눌러서 보기' }, h('span', { class: 'nw-sp-tag' }, '스포'), h('span', { class: 'nw-sp', html }));
                td.addEventListener('click', () => {
                    const sp = td.querySelector('.nw-sp');
                    sp?.classList.add('open');
                    if (sp?.dataset.sp) ui.spOpen.add(sp.dataset.sp);
                }, { once: true });
                rows.push(h('tr', { class: 'sp-row' }, h('th', null, r.label), td));
            } else {
                rows.push(h('tr', null, h('th', null, r.label), h('td', { html: inline(r.value, ctx).replace(/\n/g, '<br>') })));
            }
        }
        const { toc, body } = renderSections(a.sections, ctx);
        const art = h('article', { class: 'wk-d', style: `--tc:${tc}` },
            h('header', { class: 'nw-hd' }, h('h3', { class: 'nw-title' }, a.title), h('span', { class: 'nw-edit' }, editStamp(), articleButton(p), refindButton(p))),
            catRow(a.categories),
            a.quote ? h('div', { class: 'nw-quote' }, h('span', { class: 'nw-qt', html: inline(a.quote, ctx) }), h('small', null, '— ' + quoteName(p, a))) : null,
            h('div', { class: 'nw-top' }, h('table', { class: 'nw-box' }, h('tbody', null, rows)), a.sections.length ? toc : null),
            body,
            p.error ? h('div', { class: 'nw-err' }, '마지막 다시 쓰기 실패: ' + p.error) : null);
        return finishDoc(art, ctx);
    }

    function userNote() {
        const n = userInputs(st.char);
        return n < USER_MIN
            ? h('span', null, `채팅에서 유저 입력이 ${USER_MIN}회 이상 쌓이면 「이 문서 쓰기」가 활성화됩니다. `, h('b', null, `(지금 ${n}회)`), h('br'), '채팅을 이어 간 뒤 위키를 다시 열면 횟수가 갱신됩니다.')
            : `「이 문서 쓰기」를 누르면 페르소나 설정과 이 채팅의 대화(유저 입력 ${n}회)로 유저 문서를 씁니다. 리수가 데이터베이스 접근 허용을 물을 수 있습니다.`;
    }

    let rewriteArm = '';
    let rewriteTimer = null;
    function articleButton(p) {
        if (!p.article) {
            const locked = p.isUser && userInputs(st.char) < USER_MIN;
            return h('button', {
                type: 'button', disabled: !!st.busy || locked, onclick: () => void regenerateOne(p.name),
                title: locked ? `채팅에서 유저 입력이 ${USER_MIN}회 이상 쌓이면 활성화됩니다` : '',
            }, '이 문서 쓰기');
        }
        return rewriteButton(p.name, '이 문서 다시 쓰기', '문서', () => regenerateOne(p.name));
    }

    function refindButton(p) {
        if (p.isUser) return null;
        const busy = refinding.has(pid(p));
        return h('button', {
            type: 'button', disabled: busy || !!st.busy, onclick: () => void refindPortrait(p),
            title: '그림 목록 전체를 보고 분석 모델이 이 인물의 사진만 새로 고른다 (모델 1번)',
        }, busy ? '이미지 찾는 중…' : '이미지 다시 찾기');
    }

    function mainButton() {
        if (!st.wiki?.world?.length) return h('button', { type: 'button', disabled: !!st.busy, onclick: () => void regenerateMain() }, '세계관 쓰기');
        return rewriteButton('__main', '세계관 다시 쓰기', '세계관 문서', regenerateMain);
    }

    function rewriteButton(id, label, what, run) {
        const armed = rewriteArm === id;
        return h('button', {
            type: 'button', class: armed ? 'arm' : '', disabled: !!st.busy,
            title: armed ? `지금 ${what}를 지우고 ${modelLabel()}로 다시 쓴다${what === '문서' ? ' (대표 사진도 다시 고른다)' : ''}` : '',
            onclick: () => {
                clearTimeout(rewriteTimer);
                if (armed) {
                    rewriteArm = '';
                    return void run();
                }
                rewriteArm = id;
                rewriteTimer = setTimeout(() => { rewriteArm = ''; render(); }, 5000);
                render();
            },
        }, armed ? '한 번 더 누르면 다시 씁니다' : label);
    }

    function onRootClick(event) {
        const t = event.target;
        if (!(t instanceof Element)) return;
        const sp = t.closest('.nw-sp');
        if (sp && !sp.classList.contains('open')) {
            sp.classList.add('open');
            if (sp.dataset.sp) ui.spOpen.add(sp.dataset.sp);
            event.stopPropagation();
            return;
        }
        const go = t.closest('[data-go]');
        if (go) return select(go.getAttribute('data-go'), true);
        const fn = t.closest('[data-fn]');
        if (fn) return ui.root.querySelector(`#cw-fn-${fn.getAttribute('data-fn')}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const sec = t.closest('[data-sec]');
        if (sec) return ui.root.querySelector(`#cw-sec-${sec.getAttribute('data-sec')}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    const domListeners = [];
    function listen(target, type, fn) {
        target.addEventListener(type, fn);
        domListeners.push([target, type, fn]);
    }

    function ensureStyle() {
        if (!doc.getElementById('cw-style')) doc.head.append(h('style', { id: 'cw-style' }, CSS));
        if (!doc.getElementById('cw-font')) doc.head.append(h('link', { id: 'cw-font', rel: 'stylesheet', href: FONT_URL }));
        doc.body.classList.add('cw-on');
        if (domListeners.length) return;
        listen(doc.body, 'click', event => { if (event.target === doc.body) closePanel(); });
        listen(doc, 'keydown', event => {
            if (event.isComposing) return;
            if (av.lbEl) {
                if (event.key === 'Escape') { event.preventDefault(); avCloseLb(); }
                else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.target?.closest?.('audio,video')) {
                    event.preventDefault();
                    avStep(event.key === 'ArrowLeft' ? -1 : 1);
                } else if (event.key === 'Tab') {
                    const f = [...av.lbEl.querySelectorAll('button')];
                    const now = doc.activeElement;
                    if (f.length && (!av.lbEl.contains(now) || now === (event.shiftKey ? f[0] : f.at(-1)))) {
                        event.preventDefault();
                        (event.shiftKey ? f.at(-1) : f[0]).focus();
                    }
                }
                return;
            }
            if (event.key === 'Escape') closePanel();
        });
    }

    function closePanel() {
        avCloseLb();
        ui.root?.remove();
        void api.hideContainer();
    }

    async function openPanel() {
        ensureStyle();
        if (!ui.root) {
            ui.root = h('div', { class: 'cw', role: 'dialog', 'aria-label': '챠위키' });
            ui.root.addEventListener('click', onRootClick);
            const RO = (doc.defaultView ?? globalThis).ResizeObserver;
            if (RO) {
                let width = -1, timer = 0;
                ui.fit = new RO(entries => {
                    const w = Math.round(entries[0].contentRect.width);
                    if (w === width) return;
                    width = w;
                    clearTimeout(timer);
                    timer = setTimeout(fitNames, 150);
                });
                ui.fit.observe(ui.root);
            }
        }
        if (!ui.root.isConnected) doc.body.append(ui.root);
        ui.tab = 'wiki';
        void checkUpdate();
        const load = { label: '봇을 확인하는 중', span: [0, 0.4] };
        renderLoading(load);
        void api.showContainer('fullscreen');
        const prefs = loadSettingsOnce();
        let char = null;
        try {
            char = await currentChar();
        } catch (error) {
            console.error(LOG, 'currentChar', error);
        }
        const key = char ? charKey(char) : '';
        if (key !== st.key) {
            Object.assign(load, { label: '저장된 위키를 읽는 중', span: [0.4, 0.85] });
            renderLoading(load);
            const wiki = st.busy?.key === key ? st.wiki : (char ? ensureUser(await loadWiki(char)) : null);
            st.char = char;
            st.key = key;
            st.wiki = wiki;
            st.sel = '__main';
            clearFaces();
            st.status = '';
            st.error = '';
        } else {
            st.char = char;
        }
        Object.assign(load, { label: '설정을 읽는 중', span: [0.85, 1] });
        renderLoading(load);
        await prefs;
        ui.lastTab = null;
        render();
    }

    function renderLoading(load) {
        ui.root.replaceChildren(
            renderHead(true),
            h('section', { class: 'cw-pane' }, h('div', { class: 'cw-empty' }, h('h2', null, '위키를 여는 중입니다'),
                h('div', { class: 'cw-prog cw-load' },
                    h('span', null, load.label + '…'),
                    h('div', { class: 'tr' }, h('div', { class: 'fi', style: gaugeStyle(load, Date.now()) }))))));
    }

    const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="3.5" y="2.5" width="17" height="19" rx="2"/>'
        + '<path d="M7.5 6.3h9M7.5 10.1h9M7.5 13.9h9M7.5 17.7h5"/>'
        + '</svg>';
    const SIDE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" overflow="visible">'
        + '<g transform="translate(-2,-8.23)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="3.5" y="2.5" width="17" height="19" rx="2"/>'
        + '<path d="M7.5 6.3h9M7.5 10.1h9M7.5 13.9h9M7.5 17.7h5"/>'
        + '</g>'
        + '<text x="10" y="26.97" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">챠위키</text>'
        + '</svg>';
    const INBTN_ICON = SIDE_ICON.replace('width="20" height="20"', 'width="17" height="17"');
    const MENU_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" overflow="visible">'
        + '<text x="10" y="15.5" text-anchor="middle" font-size="17">📖</text>'
        + '</svg>';

    const IN_CLASS = 'cw-inbtn ml-4 bg-textcolor2 flex justify-center items-center w-12 h-12 rounded-md hover:bg-blue-500 transition-colors text-textcolor';
    const inBtn = { doc: null, asked: false, on: false, observer: null, clickId: '', timer: 0, job: Promise.resolve(), kids: '' };
    const inQueue = fn => (inBtn.job = inBtn.job.then(fn).catch(error => console.warn(LOG, 'input button', error)));

    async function rootDoc() {
        if (!inBtn.asked) {
            inBtn.asked = true;
            try {
                inBtn.doc = await api.getRootDocument();
            } catch (error) {
                console.warn(LOG, 'getRootDocument', error);
            }
        }
        return inBtn.doc;
    }

    async function inputRow(d) {
        const area = await d.querySelector('textarea.text-input-area');
        return area ? await area.getParent() : null;
    }

    const IN_GAP = '6px';
    const IN_EDGE = '0.375rem';
    const IN_TAIL = '-10px';
    async function tightenButtons(row, force = false) {
        const kids = await row.getChildren();
        const n = await kids.length();
        const items = [];
        for (let i = 0; i < n; i++) {
            const k = await kids.at(i);
            const cls = String(await k.getClassName() ?? '');
            if (cls.includes('text-input-area')) break;
            items.push([k, cls]);
        }
        const sign = n + '|' + items.map(x => x[1]).join('|');
        if (sign === inBtn.kids && !force) return;
        inBtn.kids = sign;
        const isBtn = cls => /(^|\s)w-12(\s|$)/.test(cls);
        const tail = items.length && isBtn(items[items.length - 1][1]) ? items.length - 1 : -1;
        let first = true;
        for (let i = 0; i < items.length; i++) {
            const [k, cls] = items[i];
            if (!isBtn(cls)) continue;
            const now = await k.getStyle('marginLeft');
            const want = first ? IN_EDGE : IN_GAP;
            first = false;
            if (now !== want) await k.setStyle('marginLeft', want);
            const right = await k.getStyle('marginRight');
            if (i === tail) { if (right !== IN_TAIL) await k.setStyle('marginRight', IN_TAIL); }
            else if (right === IN_TAIL) await k.setStyle('marginRight', '');
        }
    }

    async function placeInputButton() {
        const d = inBtn.doc;
        if (!inBtn.on || !d) return;
        const row = await inputRow(d);
        if (!row || !inBtn.on) return;
        if (await d.querySelector('.cw-inbtn')) return tightenButtons(row);
        const b = await d.createElement('button');
        await b.setClassName(IN_CLASS);
        await b.setStyle('cursor', 'pointer');
        await b.setStyle('flexShrink', '0');
        await b.setStyle('width', '2.25rem');
        await b.setStyle('height', '2.25rem');
        await b.setStyle('alignSelf', 'center');
        await b.setInnerHTML(INBTN_ICON);
        if (!inBtn.on || await d.querySelector('.cw-inbtn')) return;
        await row.prepend(b);
        await tightenButtons(row, true);
    }

    async function onRootDocClick(event) {
        if (event.button !== 0 || !inBtn.on) return;
        const b = await inBtn.doc?.querySelector('.cw-inbtn');
        const r = b ? await b.getBoundingClientRect() : null;
        if (r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
            openPanel().catch(error => console.error(LOG, 'panel', error));
        }
    }

    async function startInputButton() {
        const d = await rootDoc();
        if (!d || !st.inputBtn || inBtn.on) return;
        inBtn.on = true;
        inBtn.clickId = await d.addEventListener('click', event => void onRootDocClick(event));
        inBtn.observer = await api.createMutationObserver(() => {
            if (inBtn.timer) return;
            inBtn.timer = setTimeout(() => {
                inBtn.timer = 0;
                void inQueue(placeInputButton);
            }, 300);
        });
        const body = await d.querySelector('body');
        if (body) await inBtn.observer.observe(body, { childList: true, subtree: true });
        await placeInputButton();
    }

    async function stopInputButton() {
        inBtn.on = false;
        clearTimeout(inBtn.timer);
        inBtn.timer = 0;
        try { await inBtn.observer?.disconnect(); } catch {}
        inBtn.observer = null;
        const d = inBtn.doc;
        if (!d) return;
        if (inBtn.clickId) {
            try { await d.removeEventListener('click', inBtn.clickId); } catch {}
            inBtn.clickId = '';
        }
        try { await (await d.querySelector('.cw-inbtn'))?.remove(); } catch {}
        try {
            const row = await inputRow(d);
            if (row) await tightenButtons(row, true);
        } catch {}
        inBtn.kids = '';
    }

    async function toggleInputButton() {
        st.inputBtn = !st.inputBtn;
        savePref('wiki_inputbtn', st.inputBtn);
        render();
        if (!st.inputBtn) return inQueue(stopInputButton);
        const reopen = !inBtn.asked && ui.root?.isConnected;
        if (reopen) closePanel();
        await inQueue(startInputButton);
        if (reopen) await openPanel();
        else render();
    }

    const onMenuButton = () => { openPanel().catch(error => console.error(LOG, 'panel', error)); };
    const menuButtons = [];
    try {
        menuButtons.push(await api.registerButton({
            name: '챠위키', icon: MENU_ICON, iconType: 'html', location: 'chat', id: 'char-wiki-panel',
        }, onMenuButton));
    } catch (error) {
        console.warn(LOG, 'chat button', error);
    }
    try {
        menuButtons.push(await api.registerButton({
            name: '📖 챠위키', icon: SIDE_ICON, iconType: 'html', location: 'hamburger', id: 'char-wiki-side',
        }, onMenuButton));
    } catch (error) {
        console.warn(LOG, 'hamburger button', error);
    }
    const savedInputBtn = await api.pluginStorage.getItem('wiki_inputbtn').catch(() => null);
    st.inputBtn = savedInputBtn !== false && savedInputBtn !== 'false';
    if (st.inputBtn) void inQueue(startInputButton);
    await api.onUnload(async () => {
        try { await stopInputButton(); } catch {}
        try {
            ui.fit?.disconnect();
            ui.root?.remove();
            doc.getElementById('cw-style')?.remove();
            doc.getElementById('cw-font')?.remove();
            doc.body.classList.remove('cw-on');
            for (const [target, type, fn] of domListeners.splice(0)) target.removeEventListener(type, fn);
        } catch {}
        for (const button of menuButtons) try { await api.unregisterUIPart(button.id); } catch {}
    });
    if (globalThis.__CW_TEST__ === true) {
        globalThis.__CW_TEST__ = { parseJson, cleanText, packSources, personSources, rosterSources, normalizeArticle, inline, groupSources, articleList, findArticle, st, openPanel, generateAll, pickFaces, checkFaces, facePrompt, fixIds, assetPool, rosterPrompt, articlePrompt, profileOf };
    }
    console.log(LOG, `v${VERSION} ready`);
})().catch(error => {
    console.error('[챠위키]', error);
});
