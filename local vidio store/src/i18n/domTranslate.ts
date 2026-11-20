import { useEffect } from 'react';
import type { Locale } from './translations';
import { translatePhrase } from './phrases';

/**
 * DOM 兜底翻译层。
 *
 * 现有组件一部分已经用 `tr()` 接好，但还有大量硬编码中文散落在各组件里。
 * 与其把每个组件重写一遍（成本高、容易漏），这里做一层"显示层"翻译：
 * 英文模式下遍历 DOM 文本节点与 title/placeholder/aria-label，按短语字典替换，
 * 并把原文记在 WeakMap 里，切回中文时还原。
 *
 * 只翻译字典里能命中的"界面文案"，用户数据（文件名、分组名、标签、歌名）不会命中，保持原样。
 */

/** 带数字/变量、不适合做精确匹配的文案 */
const PATTERNS: Array<[RegExp, string]> = [
  [/^(\d+) 个视频$/, '$1 videos'],
  [/^(\d+) 个文件$/, '$1 files'],
  [/^(\d+) 个$/, '$1'],
  [/^个$/, ''],
  [/^还有 (\d+) 个文件\.\.\.$/, 'and $1 more files…'],
  [/^已选 (\d+) 个视频$/, '$1 selected'],
  [/^第 (\d+) 拍$/, 'Beat $1'],
  [/^共 (\d+) 个视频$/, '$1 videos total'],
  [/^(\d+) 个视频 · ([\d-]+)$/, '$1 videos · $2'],
  [/^(\d+) 个视频 · 含子分组$/, '$1 videos · includes subfolders'],
  [/^本层直接 (\d+) 个视频$/, '$1 videos here'],
  [/^含子文件夹共 (\d+) 个$/, '$1 in total'],
  [/^已暂停在 ([\d:.]+)$/, 'Paused at $1'],
  [/^(\d+) 个匹配$/, '$1 matched'],
  [/^\/ 共 (\d+)$/, '/ $1 total'],
  [/^(\d+) BPM$/, '$1 BPM'],
];

const ATTRS = ['title', 'placeholder', 'aria-label'] as const;

const TEXT_ORIGINAL = new WeakMap<Text, string>();
const ATTR_ORIGINAL = new WeakMap<Element, Record<string, string>>();
/** 我们写进 DOM 的英文，用来分辨「React 又写回中文」与「这是我们自己写的」 */
const ATTR_WRITTEN = new WeakMap<Element, Record<string, string>>();

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

function translateString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // 先走统一短语层（精确表 + 正则规则），这一层与 tr() 共用同一份字典，避免两边各写一半
  const shared = translatePhrase(trimmed, 'en');
  if (shared !== trimmed) return value.replace(trimmed, shared);
  for (const [re, replacement] of PATTERNS) {
    if (re.test(trimmed)) return value.replace(trimmed, trimmed.replace(re, replacement));
  }
  return null;
}

function applyToTextNode(node: Text, locale: Locale) {
  if (!node.nodeValue) return;
  if (locale === 'en') {
    if (TEXT_ORIGINAL.has(node)) return;
    const next = translateString(node.nodeValue);
    if (next === null) return;
    TEXT_ORIGINAL.set(node, node.nodeValue);
    node.nodeValue = next;
  } else if (TEXT_ORIGINAL.has(node)) {
    node.nodeValue = TEXT_ORIGINAL.get(node)!;
    TEXT_ORIGINAL.delete(node);
  }
}

function applyToElement(el: Element, locale: Locale) {
  for (const attr of ATTRS) {
    const current = el.getAttribute(attr);
    const original = ATTR_ORIGINAL.get(el) || {};
    const written = ATTR_WRITTEN.get(el) || {};
    if (locale === 'en') {
      if (!current) continue;
      // 自己写进去的英文不要再翻一遍
      if (written[attr] && current === written[attr]) continue;
      // 原文没变就跳过；变了（分组计数更新之类）要按新文案重译
      if (original[attr] && current === original[attr]) continue;
      const next = translateString(current);
      if (next === null || next === current) continue;
      original[attr] = current;
      written[attr] = next;
      ATTR_ORIGINAL.set(el, original);
      ATTR_WRITTEN.set(el, written);
      el.setAttribute(attr, next);
    } else if (original[attr]) {
      // 切回中文：还原成最近一次的原文
      el.setAttribute(attr, original[attr]);
      delete original[attr];
      delete written[attr];
      ATTR_ORIGINAL.set(el, original);
      ATTR_WRITTEN.set(el, written);
    }
  }
}

function walkTextNodes(root: Node, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has((node as Element).tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      applyToTextNode(node as Text, locale);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      applyToElement(node as Element, locale);
    }
    node = walker.nextNode();
  }
}

/** 在 App 根部调用一次：英文模式下自动把残留中文替换成英文 */
export function useDomPhraseTranslation(locale: Locale) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.body;

    walkTextNodes(root, locale);

    if (locale !== 'en') return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          const text = mutation.target as Text;
          // React 重新渲染会写回中文，这里重新翻译一次
          TEXT_ORIGINAL.delete(text);
          applyToTextNode(text, 'en');
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              applyToTextNode(added as Text, 'en');
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              walkTextNodes(added, 'en');
            }
          });
        } else if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          applyToElement(mutation.target as Element, 'en');
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => observer.disconnect();
  }, [locale]);
}
