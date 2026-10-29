/** Original TextMesh Pro atlas renderer. No replacement system fonts are used. */
export class BitmapText {
  constructor(configFonts, manifest) {
    this.config = configFonts || {};
    this.manifest = manifest || {};
    this.fonts = new Map();
    this.tints = new Map();
  }

  async load() {
    await Promise.all(Object.entries(this.config).map(async ([name, source]) => {
      const atlasName = source.atlas?.name || source.atlas;
      const entry = this.manifest.textures?.[atlasName];
      const url = entry?.path || source.path || atlasName;
      if (!url) throw new Error(`Missing original atlas for ${name}`);
      const image = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load font atlas: ${url}`));
        image.src = url;
      });
      const info = source.info || source.m_fontInfo || {};
      const glyphs = new Map((source.glyphs || source.m_glyphInfoList || []).map(g => [g.id, g]));
      const kerning = new Map();
      for (const pair of source.kerning?.kerningPairs || []) {
        kerning.set(`${pair.m_FirstGlyph}:${pair.m_SecondGlyph}`, Number(pair.xOffset || 0));
      }
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0);
      // Agenda's original atlases are ordinary antialiased bitmap glyphs. Only
      // Liberation Sans is an SDF atlas; thresholding Agenda would alter its face.
      const sdf = Number(source.fontAssetType ?? source.assetType ?? (/SDF/i.test(name) ? 1 : 0)) === 1;
      if (sdf && !source.processed) {
        try {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const distance = pixels.data[i + 3] / 255;
            const t = Math.max(0, Math.min(1, (distance - .45) / .10));
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
            pixels.data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255);
          }
          context.putImageData(pixels, 0, 0);
        } catch (error) {
          // file:// can forbid readback. Agenda/Roboto use their untouched bitmap
          // alpha and remain exact; the optional SDF font can still be displayed.
          if (error.name !== 'SecurityError') throw error;
        }
      }
      this.fonts.set(name, {name, info, glyphs, kerning, atlas: canvas});
    }));
    return this;
  }

  font(name = 'AgendaMediumEC', bold = false) {
    if (bold && /AgendaMediumEC/i.test(name)) name = name.replace(/AgendaMediumEC/i, 'AgendaBoldEC');
    if (bold && /AccentsRobotoMediumC/i.test(name)) name = name.replace(/AccentsRobotoMediumC/i, 'AccentsRobotoBoldC');
    return this.fonts.get(name) || this.fonts.get('AgendaMediumEC') || this.fonts.values().next().value;
  }

  numberSign(font) {
    this.numberSigns ??= new Map();
    if (this.numberSigns.has(font.name)) return this.numberSigns.get(font.name);
    const n = font.glyphs.get(78), o = font.glyphs.get(111);
    if (!n || !o) return font;
    // Compose the missing numero sign from the supplied atlas's N and raised o.
    // It remains one character for reveal, layout and accessible text.
    const atlas = document.createElement('canvas');
    atlas.width = Math.ceil(n.xAdvance + o.width * .52 + 2);
    atlas.height = Math.ceil(n.height);
    const ctx = atlas.getContext('2d');
    ctx.drawImage(font.atlas, n.x, n.y, n.width, n.height, 0, 0, n.width, n.height);
    ctx.drawImage(font.atlas, o.x, o.y, o.width, o.height, n.xAdvance, 0, o.width * .52, o.height * .52);
    ctx.fillStyle = '#fff';
    ctx.fillRect(n.xAdvance, o.height * .52 + 2, o.width * .52, 1.5);
    const glyph = { ...n, id: 0x2116, x: 0, y: 0, width: atlas.width, height: atlas.height, xAdvance: atlas.width };
    const composite = { ...font, name: font.name + ':numero', atlas, glyphs: new Map([[0x2116, glyph]]), kerning: new Map() };
    this.numberSigns.set(font.name, composite);
    return composite;
  }

  /** Parse the Unity rich-text tags used by the source dialogue. */
  characters(text, options = {}) {
    const result = [];
    const initial = {bold: false, italic: false, color: options.color || '#fff', size: options.size || 124};
    const stacks = {b: [false], i: [false], color: [initial.color], size: [initial.size]};
    const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, entity => {
      const known = {'&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&apos;':"'", '&nbsp;':'\u00a0'};
      if (known[entity.toLowerCase()]) return known[entity.toLowerCase()];
      const hex = entity[2]?.toLowerCase() === 'x';
      return String.fromCodePoint(parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10));
    });
    let index = 0;
    for (const token of String(text ?? '').replace(/\r\n?/g, '\n').split(/(<[^>]+>)/g)) {
      if (!token) continue;
      if (token[0] === '<') {
        if (/^<br\s*\/?>$/i.test(token)) {
          result.push({char: '\n', ...initial, index: index++});
          continue;
        }
        const match = token.match(/^<(\/)?(b|i|color|size)(?:\s*=\s*["']?([^>"']+)["']?)?\s*>$/i);
        if (match) {
          const [, closing, rawTag, value] = match;
          const tag = rawTag.toLowerCase();
          if (closing) {
            if (stacks[tag].length > 1) stacks[tag].pop();
          } else {
            let next = tag === 'b' || tag === 'i' ? true : value;
            if (tag === 'size') {
              next = value?.endsWith('%') ? initial.size * parseFloat(value) / 100 : parseFloat(value);
              if (!Number.isFinite(next)) next = initial.size;
            }
            stacks[tag].push(next);
          }
          continue;
        }
        // Other TMP formatting tags do not contribute to the reveal count.
        if (/^<\/?(?:font|align|alpha|voffset|cspace|mspace|line-height|indent|margin|style|u|s|mark|sup|sub|noparse)(?:[ =][^>]*)?>$/i.test(token)) continue;
      }
      for (const char of decode(token)) {
        result.push({char, bold: stacks.b.at(-1), italic: stacks.i.at(-1), color: stacks.color.at(-1), size: stacks.size.at(-1), index: index++});
      }
    }
    return result;
  }

  layout(text, options = {}) {
    if (!this.fonts.size) throw new Error('BitmapText.load() must complete before layout');
    const base = this.font(options.font);
    const size = options.size || 124;
    const scale = size / (base.info.PointSize || 56);
    const lineHeight = options.lineHeight || (base.info.LineHeight || 64.5625) * scale;
    const ascent = (base.info.Ascender || 48.875) * scale;
    const descent = Math.abs(base.info.Descender || -11.1875) * scale;
    const limit = options.maxWidth ?? options.width ?? Infinity;
    const lines = [{glyphs: [], width: 0}];
    const characters = this.characters(text, options);
    let previous = null;
    let word = [];

    const measure = (character, previousGlyph) => {
      let font = this.font(options.font, character.bold);
      const codepoint = character.char.codePointAt(0);
      if (!font.glyphs.has(codepoint) && !/\s/.test(character.char)) {
        // The source build includes its own Roboto atlases for translated text.
        const fallback = this.font(character.bold ? 'AccentsRobotoBoldC' : 'AccentsRobotoMediumC');
        if (fallback.glyphs.has(codepoint)) font = fallback;
      }
      if (options.extendedGlyphs && !font.glyphs.has(codepoint)) {
        const extra = this.font(character.bold ? 'AgendaBoldEC' : 'AgendaMediumEC');
        if (extra.glyphs.has(codepoint)) font = extra;
        else if (codepoint === 0x2116) font = this.numberSign(font);
      }
      const glyph = font.glyphs.get(codepoint) || font.glyphs.get(63);
      const factor = character.size / (font.info.PointSize || 56) * (glyph?.scale || 1);
      const kerning = previousGlyph?.font === font ? font.kerning.get(`${previousGlyph.glyph?.id}:${glyph?.id}`) || 0 : 0;
      const advance = character.char === '\t' ? (font.info.TabWidth || 88.75) * factor : (glyph?.xAdvance || 0) * factor;
      return {...character, font, glyph, factor, advance, kerning: kerning * factor};
    };
    const newLine = () => { lines.push({glyphs: [], width: 0}); previous = null; };
    const place = character => {
      let line = lines.at(-1);
      let item = measure(character, previous);
      if (line.glyphs.length && line.width + item.kerning + item.advance > limit && !/\s/.test(character.char)) {
        newLine(); line = lines.at(-1); item = measure(character, null);
      }
      item.x = line.width + item.kerning;
      line.glyphs.push(item);
      line.width += item.kerning + item.advance;
      previous = item;
    };
    const flushWord = () => {
      if (!word.length) return;
      const line = lines.at(-1);
      let before = previous;
      let wordWidth = 0;
      for (const character of word) {
        const item = measure(character, before);
        wordWidth += item.kerning + item.advance;
        before = item;
      }
      if (line.glyphs.length && line.width + wordWidth > limit) newLine();
      for (const character of word) place(character);
      word = [];
    };
    for (const character of characters) {
      if (character.char === '\n') { flushWord(); newLine(); }
      else if (/\s/.test(character.char)) { flushWord(); place(character); }
      else word.push(character);
    }
    flushWord();
    return {
      lines, count: characters.length, plainText: characters.map(c => c.char).join(''),
      width: Math.max(0, ...lines.map(line => line.width)),
      height: Math.max(lineHeight, (lines.length - 1) * lineHeight + ascent + descent),
      lineHeight, ascent, descent,
    };
  }

  tinted(font, color) {
    const key = `${font.name}:${color}`;
    if (this.tints.has(key)) return this.tints.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = font.atlas.width;
    canvas.height = font.atlas.height;
    const context = canvas.getContext('2d');
    context.drawImage(font.atlas, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color || '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    this.tints.set(key, canvas);
    return canvas;
  }

  gradientGlyph(font, glyph, sourceY, colors) {
    this.gradientGlyphs ??= new Map();
    const key = `${font.name}:${glyph.id}:${JSON.stringify(colors)}`;
    if (this.gradientGlyphs.has(key)) return this.gradientGlyphs.get(key);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(glyph.width);canvas.height=Math.ceil(glyph.height);
    const ctx=canvas.getContext('2d');ctx.drawImage(font.atlas,glyph.x,sourceY,glyph.width,glyph.height,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='source-in';const gradient=ctx.createLinearGradient(0,0,0,canvas.height);
    const css=v=>`rgba(${v.slice(0,3).map(n=>Math.round(n*255)).join(',')},${v[3]??1})`;
    gradient.addColorStop(0,css(colors.topLeft));gradient.addColorStop(1,css(colors.bottomLeft));ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);
    this.gradientGlyphs.set(key,canvas);return canvas;
  }

  draw(canvas, text, options = {}) {
    const layout = this.layout(text, options);
    const ratio = options.pixelRatio || 1;
    const outline = Math.max(0, options.outline || 0);
    const padding = options.padding ?? outline + 1;
    const width = options.width || (Number.isFinite(options.maxWidth) ? options.maxWidth : Math.ceil(layout.width + 2 * padding));
    const height = options.height || Math.ceil(layout.height + 2 * padding);
    canvas.width = Math.max(1, Math.ceil(width * ratio));
    canvas.height = Math.max(1, Math.ceil(height * ratio));
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    let visibleCount = 0;
    for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
      const line = layout.lines[lineIndex];
      const align = options.align === 'center' ? (width - line.width) / 2 : options.align === 'right' ? width - line.width - padding : padding;
      for (const item of line.glyphs) {
        if (item.index >= (options.maxChars ?? Infinity)) continue;
        visibleCount++;
        const glyph = item.glyph;
        if (!glyph || /\s/.test(item.char) || glyph.y >= item.font.atlas.height) continue;
        const x = (options.x || 0) + align + item.x + glyph.xOffset * item.factor;
        const y = (options.y || 0) + padding + layout.ascent + lineIndex * layout.lineHeight - glyph.yOffset * item.factor;
        // Legacy TMP m_glyphInfoList stores atlas y from its top edge, unlike
        // modern GlyphRect. UnityPy's exported texture is already top-down.
        const sourceY = glyph.y;
        const w = glyph.width * item.factor;
        const h = glyph.height * item.factor;
        context.save();
        if (item.italic) {
          const skew = Math.tan(12 * Math.PI / 180);
          context.transform(1, 0, -skew, 1, skew * (y + h), 0);
        }
        if (outline) {
          const edge = this.tinted(item.font, options.outlineColor || '#000');
          const steps = Math.max(8, Math.ceil(outline * 4));
          for (let step = 0; step < steps; step++) {
            const angle = step * Math.PI * 2 / steps;
            context.drawImage(edge, glyph.x, sourceY, glyph.width, glyph.height,
              x + Math.cos(angle) * outline, y + Math.sin(angle) * outline, w, h);
          }
        }
        if(options.gradient&&item.color===(options.color||'#fff'))context.drawImage(this.gradientGlyph(item.font,glyph,sourceY,options.gradient),x,y,w,h);
        else context.drawImage(this.tinted(item.font, item.color), glyph.x, sourceY, glyph.width, glyph.height, x, y, w, h);
        context.restore();
      }
    }
    canvas.setAttribute('aria-label', layout.plainText);
    return {...layout, visibleCount};
  }
}
