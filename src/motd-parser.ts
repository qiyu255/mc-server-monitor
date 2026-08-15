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

export interface MotdSegment {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  dimColor: boolean;
  isNewline?: boolean;
}

/**
 * Pre-process a string to handle literal \\u00A7 escape sequences
 * that some servers send instead of actual § characters.
 */
function preProcessMotd(str: string): string {
  // Replace literal \\u00A7 (6 chars) with actual § (U+00A7)
  return str.replace(/\\\\u00A7/g, '\u00A7').replace(/\\u00A7/g, '§');
}

export function parseMotd(motd: string | object | null): MotdSegment[] {
  if (typeof motd === 'object' && motd !== null) {
    return parseChatObject(motd);
  }

  if (typeof motd !== 'string') {
    return [{ text: String(motd), color: 'white', bold: false, italic: false, underline: false, strikethrough: false, dimColor: false }];
  }

  const rawStr = preProcessMotd(motd);
  const segments: MotdSegment[] = [];
  let current: MotdSegment = {
    text: '',
    color: 'white',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    dimColor: false,
  };

  for (let i = 0; i < rawStr.length; i++) {
    const char = rawStr[i];

    if (char === '\u00A7' || char === '§' || char === '&') {
      const code = rawStr[i + 1];
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
      } else if (code in COLOR_MAP) {
        current.color = COLOR_MAP[code as keyof typeof COLOR_MAP];
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
      // k (obfuscated) is ignored in terminal
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

function parseChatObject(obj: any): MotdSegment[] {
  const segments: MotdSegment[] = [];

  function extract(node: any, inherited = { color: 'white', bold: false, italic: false, underline: false, strikethrough: false }) {
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

    // Handle translate component — extract text from "with" array if present
    if (node.translate !== undefined) {
      if (node.with && Array.isArray(node.with)) {
        for (const item of node.with) {
          extract(item, current);
        }
      } else {
        const parsed = parseMotd(String(node.translate));
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
    }

    // Use !== undefined so empty string "" is still processed
    if (node.text !== undefined) {
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

export function cleanMotd(motd: any): string {
  if (typeof motd === 'object' && motd !== null) {
    if (motd.text) return cleanMotd(motd.text);
    if (motd.extra) {
      return motd.extra.map((e: any) => cleanMotd(e)).join('');
    }
    return '';
  }
  if (typeof motd !== 'string') return String(motd);
  return motd.replace(/[§&][0-9a-fk-or]/gi, '').replace(/\u00A7[0-9a-fk-or]/gi, '').replace(/\n/g, ' ');
}