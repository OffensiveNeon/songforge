// Small DOM helpers shared by all views.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export async function copyText(text, label = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    // clipboard API can fail on http:// — fall back to a prompt-free path
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(label);
  }
}

export function copyBlock(text, buttonLabel = '📋 Copy') {
  return el('div', {},
    el('div', { class: 'mono' }, text),
    el('button', { class: 'btn small', onclick: () => copyText(text) }, buttonLabel),
  );
}

// Minimal markdown renderer for the playbook view (headers, bold, code, lists).
export function renderMd(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let inCode = false, inList = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) {
      html += inCode ? '</pre>' : '<pre>';
      inCode = !inCode;
      continue;
    }
    if (inCode) { html += esc(line) + '\n'; continue; }
    let l = esc(line);
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
    const isLi = /^\s*[-*] /.test(line);
    if (isLi && !inList) { html += '<ul>'; inList = true; }
    if (!isLi && inList) { html += '</ul>'; inList = false; }
    if (isLi) html += '<li>' + l.replace(/^\s*[-*] /, '') + '</li>';
    else if (/^### /.test(l)) html += '<h4>' + l.slice(4) + '</h4>';
    else if (/^## /.test(l)) html += '<h3>' + l.slice(3) + '</h3>';
    else if (/^# /.test(l)) html += '<h2>' + l.slice(2) + '</h2>';
    else if (l.trim() === '---') html += '<hr>';
    else if (l.trim()) html += '<p>' + l + '</p>';
  }
  if (inList) html += '</ul>';
  if (inCode) html += '</pre>';
  return html;
}
