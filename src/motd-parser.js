/**
 * Parse Minecraft MOTD (Message of the Day) color/formatting codes
 * into an array of segments with color and style properties for Ink.
 */

const COLOR_MAP = {
  '0': 'black',
  '1': 'blue',
  '2': 'green',
  '3': 'cyan',
  '4': 'red',
  '5': 'magenta',
  '6': 'yellow',
  '7': 'gray',
  '8': 'gray',
  '9': 'blue',
  'a': 'green',
  'b': 'cyan',
  'c': 'red',
  'd': 'magenta',
  'e': 'yellow',
  'f': 'white',
};

export function parseMotd(motd) {
  if (typeof motd === 'object' && motd !== null) {
    return parseChatObject(motd);
  }

  if (typeof motd !== 'string') {
    return [{ text: String(motd), color: 'white', bold: false, italic: false, underline: false, strikethrough: false, dimColor: false }];
  }

  const segments = [];
  let current = {
    text: '',
    color: 'white',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    dimColor: false,
  };

  for (let i = 0; i < motd.length; i++) {
    const char = motd[i];

    if (char === '\u00A7' || char === '§' || char === '&') {
      const code = motd[i + 1];
      if (!code) continue;
      i++;

      if (current.text.length > 0) {
        segments.push({ ...current });
        current.text = '';
      }

      if (code === 'r') {
        current.color = 'white';
        current.bold = false;
        current.italic = false;
        current.underline = false;
        current.strikethrough = false;
        current.dimColor = false;
      } else if (COLOR_MAP[code]) {
        current.color = COLOR_MAP[code];
        current.dimColor = code === '8';
      } else if (code === 'l') {
        current.bold = true;
      } else if (code === 'o') {
        current.italic = true;
      } else if (code === 'n') {
        current.underline = true;
      } else if (code === 'm') {
        current.strikethrough = true;
      }
    } else if (char === '\n') {
      if (current.text.length > 0) {
        segments.push({ ...current });
        current.text = '';
      }
      segments.push({ text: '\n', color: current.color, bold: false, italic: false, underline: false, strikethrough: false, dimColor: false, isNewline: true });
    } else {
      current.text += char;
    }
  }

  if (current.text.length > 0) {
    segments.push({ ...current });
  }

  if (segments.length === 0) {
    return [{ text: '', color: 'white', bold: false, italic: false, underline: false, strikethrough: false, dimColor: false }];
  }

  return segments;
}

function parseChatObject(obj) {
  const segments = [];

  function extract(node, inherited = { color: 'white', bold: false, italic: false, underline: false, strikethrough: false }) {
    if (typeof node === 'string') {
      const parsed = parseMotd(node);
      for (const seg of parsed) {
        segments.push({
          ...seg,
          color: seg.color !== 'white' ? seg.color : inherited.color,
          bold: seg.bold || inherited.bold,
          italic: seg.italic || inherited.italic,
          underline: seg.underline || inherited.underline,
          strikethrough: seg.strikethrough || inherited.strikethrough,
        });
      }
      return;
    }

    if (!node || typeof node !== 'object') return;

    const current = {
      color: node.color || inherited.color,
      bold: node.bold || inherited.bold,
      italic: node.italic || inherited.italic,
      underline: node.underlined || inherited.underline,
      strikethrough: node.strikethrough || inherited.strikethrough,
    };

    if (node.text) {
      const parsed = parseMotd(node.text);
      for (const seg of parsed) {
        segments.push({
          ...seg,
          color: seg.color !== 'white' ? seg.color : current.color,
          bold: seg.bold || current.bold,
          italic: seg.italic || current.italic,
          underline: seg.underline || current.underline,
          strikethrough: seg.strikethrough || current.strikethrough,
        });
      }
    }

    if (node.extra && Array.isArray(node.extra)) {
      for (const child of node.extra) {
        extract(child, current);
      }
    }
  }

  extract(obj);

  if (segments.length === 0) {
    return [{ text: '', color: 'white', bold: false, italic: false, underline: false, strikethrough: false, dimColor: false }];
  }

  return segments;
}

export function cleanMotd(motd) {
  if (typeof motd === 'object' && motd !== null) {
    if (motd.text) return cleanMotd(motd.text);
    if (motd.extra) {
      return motd.extra.map(e => cleanMotd(e)).join('');
    }
    return '';
  }
  if (typeof motd !== 'string') return String(motd);
  return motd.replace(/[§&][0-9a-fk-or]/gi, '').replace(/\u00A7[0-9a-fk-or]/gi, '').replace(/\n/g, ' ');
}