// ==UserScript==
// @name         Shalom EG0008W: ポップアップ & 「個人番号出力設定」ハイライト
// @namespace    https://example.com/
// @version      0.5
// @description  EG0008Wに来たら注意ポップアップを出し、「個人番号出力設定」を黄色でマーキング
// @match        *://4ever.shalom-house.jp/*
// @run-at       document-end
// @grant        GM_addStyle
// @namespace    https://github.com/awrchrw/shalom_eg0008w_helper/raw/refs/heads/
// @installURL   https://github.com/awrchrw/shalom_eg0008w_helper/raw/refs/heads/main/shalom-eg0008w.user.js
// @downloadURL  https://github.com/awrchrw/shalom_eg0008w_helper/raw/refs/heads/main/shalom-eg0008w.user.js
// @updateURL    https://github.com/awrchrw/shalom_eg0008w_helper/raw/refs/heads/main/shalom-eg0008w.user.js
// ==/UserScript==

(function () {
    "use strict";

    const PATH_KEY = "/EG0008W";
    const KEYWORD = "個人番号出力設定";
    const POPUP_ID = "mn-eg0008w-popup";
    const HILITE_CLASS = "mn-eg0008w-highlight";

    // --- style ---
    const css = `
#${POPUP_ID}-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center; z-index: 2147483647;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans JP", sans-serif; }
#${POPUP_ID} { background: #fff; border-radius: 12px; padding: 20px; width: min(480px, 92vw);
  box-shadow: 0 10px 30px rgba(0,0,0,.25); }
#${POPUP_ID} h3 { font-size: 18px; margin: 0 0 8px; }
#${POPUP_ID} p  { margin: 6px 0 16px; line-height: 1.6; }
#${POPUP_ID} .actions { display: flex; gap: 8px; justify-content: flex-end; }
#${POPUP_ID} button { border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
#${POPUP_ID} .ok { background: #0d6efd; color: #fff; }
.${HILITE_CLASS} { background: yellow !important; color: inherit; padding: 0 .1em; border-radius: .15em; }
  `;
    if (typeof GM_addStyle === "function") GM_addStyle(css);
    else document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

    // --- utility: once guard per URL ---
    let done = false;
    function isTarget() {
        return location.pathname.includes(PATH_KEY) || location.href.includes(PATH_KEY);
    }

    // --- core ---
    function run() {
        if (done || !isTarget()) return;
        done = true;

        // ポップアップ
        showPopup();

        // ハイライト（初回）
        highlightKeyword(document.body, KEYWORD);

        // 動的描画対策（SPA等）
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type === "childList") {
                    m.addedNodes.forEach((n) => {
                        if (n.nodeType === 1) highlightKeyword(n, KEYWORD);
                    });
                } else if (m.type === "characterData") {
                    const el = m.target && m.target.parentElement;
                    if (el) highlightKeyword(el, KEYWORD);
                }
            }
        });
        obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    }

    // --- popup (Escで閉じる対応を追加) ---
    function showPopup() {
        if (document.getElementById(POPUP_ID + "-backdrop")) return;

        const backdrop = document.createElement("div");
        backdrop.id = POPUP_ID + "-backdrop";
        backdrop.innerHTML = `
      <div id="${POPUP_ID}" role="dialog" aria-modal="true" aria-labelledby="${POPUP_ID}-title">
        <h3 id="${POPUP_ID}-title">確認のお願い</h3>
        <p>この画面を操作する前に、<span class="${HILITE_CLASS}">個人番号出力設定</span> を確認してください。</p>
        <div class="actions"><button class="ok" type="button">OK</button></div>
      </div>`;

        const okBtn = backdrop.querySelector(".ok");

        // 閉じ処理を関数化して共通利用
        function close() {
            window.removeEventListener("keydown", onKeyDown);
            backdrop.remove();
        }
        // Escキーで閉じる
        function onKeyDown(e) {
            // 一部ブラウザ互換のため "Esc" も見る
            if (e.key === "Escape" || e.key === "Esc") {
                e.preventDefault();
                close();
            }
        }

        okBtn.addEventListener("click", close);
        backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
        window.addEventListener("keydown", onKeyDown);

        document.body.appendChild(backdrop);
        // 使い勝手向上：表示後にOKへフォーカス
        if (okBtn && typeof okBtn.focus === "function") okBtn.focus();
    }

    // --- highlight text nodes containing the keyword ---
    function highlightKeyword(root, keyword) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                const txt = node.nodeValue;
                if (!txt.includes(keyword)) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || p.closest(`.${HILITE_CLASS}`)) return NodeFilter.FILTER_REJECT;
                const tn = p.tagName;
                if (/(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT)/.test(tn)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const targets = [];
        while (walker.nextNode()) targets.push(walker.currentNode);
        for (const textNode of targets) {
            const parts = textNode.nodeValue.split(keyword);
            const frag = document.createDocumentFragment();
            parts.forEach((part, i) => {
                if (part) frag.appendChild(document.createTextNode(part));
                if (i < parts.length - 1) {
                    const mark = document.createElement("span");
                    mark.className = HILITE_CLASS;
                    mark.textContent = keyword;
                    frag.appendChild(mark);
                }
            });
            textNode.parentNode.replaceChild(frag, textNode);
        }
    }

    // --- URL/描画の変化に強くする（初回＆監視） ---
    function safeInit() {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => setTimeout(run, 0), { once: true });
        } else {
            setTimeout(run, 0);
        }
        for (const m of ["pushState","replaceState"]) {
            const orig = history[m];
            history[m] = function() { const r = orig.apply(this, arguments); setTimeout(run, 0); return r; };
        }
        window.addEventListener("popstate", () => setTimeout(run, 0));
        let tries = 0;
        const id = setInterval(() => {
            if (done) return clearInterval(id);
            if (isTarget()) run();
            if (++tries > 50) clearInterval(id);
        }, 500);
    }

    safeInit();
})();
