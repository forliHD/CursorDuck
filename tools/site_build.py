#!/usr/bin/env python3
"""Assemble the cursorduck.com website into _site/.

The site is plain HTML/CSS/JS without a framework, but it runs the real duck,
so it needs the engine files and the sounds from the extension next to it.
This script

  1. copies site/ to _site/,
  2. adds src/{models,render,effects,engine}.js, audio/ and icons/,
  3. writes _site/data.js with the version, the model/achievement/trick counts,
     the model names in both languages (from _locales/) and the site strings
     (English from the markup, German from site/de.json),
  4. checks that every data-i18n key used in the HTML has a German string and
     that releases.json is well-formed; when the newest release is missing from
     it, the entry is generated from the update page strings (tools/release_log.py),
  5. pre-renders the German start page as _site/de/index.html (search engines
     index / and /de/ as the two language versions, linked by hreflang), fills
     the structured data with version and description, and writes sitemap.xml
     from the canonical URLs of all indexable pages,
  6. fingerprints every script and stylesheet a page loads (/site.js?v=<hash>):
     Cloudflare lets browsers keep JS and CSS for four hours, so without a new
     address per version returning visitors would run old code on new pages.

Cloudflare Pages runs it as the build command with `_site` as the output
directory; locally it feeds the "site" preview server.
"""
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, '_site')
ENGINE = ['models.js', 'render.js', 'effects.js', 'engine.js']
BASE = 'https://cursorduck.com'
# the start page's language versions, as index.html declares them with hreflang
START_PAGES = (('en', '/'), ('de', '/de/'), ('x-default', '/'))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def block(text, start, end='\n  ];'):
    """The source text between `start` and the next `end` (an array literal)."""
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]


def names_from(locale):
    msgs = json.loads(read('_locales', locale, 'messages.json'))
    out = {}
    for key, val in msgs.items():
        if key.startswith('model_'):
            out[key[6:].replace('_', '-')] = val['message']
    return out


TAG = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>')
LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def translate_page(page, dom):
    """Do at build time what site.js does in the browser: swap the text of every
    data-i18n element and the data-i18n-ph / data-i18n-content attributes.
    Returns the translated page and the English strings it replaced, keyed the
    way site.js keys them."""
    out, en, pos = [], {}, 0
    for m in TAG.finditer(page):
        if m.start() < pos:
            continue
        attrs = m.group(2) or ''
        for kind, target in (('ph', 'placeholder'), ('content', 'content')):
            key = re.search(r'\sdata-i18n-%s="([^"]+)"' % kind, attrs)
            if key:
                val = re.search(r'\s%s="([^"]*)"' % target, attrs)
                en[kind + ':' + key.group(1)] = html.unescape(val.group(1))
                new = dom.get(key.group(1), en[kind + ':' + key.group(1)])
                attrs = attrs[:val.start(1)] + html.escape(new) + attrs[val.end(1):]
        out.append(page[pos:m.start()] + '<' + m.group(1) + attrs + '>')
        pos = m.end()
        key = re.search(r'\sdata-i18n="([^"]+)"', attrs)
        if key:
            close = page.index('</', pos)
            if '<' in page[pos:close] or not page.startswith('</' + m.group(1) + '>', close):
                raise SystemExit('ERROR: data-i18n="%s" must hold plain text only' % key.group(1))
            en[key.group(1)] = html.unescape(page[pos:close])
            out.append(html.escape(dom.get(key.group(1), en[key.group(1)]), quote=False))
            pos = close
    out.append(page[pos:])
    return ''.join(out), en


def german_start_page(page, de):
    """The pre-rendered German start page: translated text plus its own address."""
    for old, new in (('<html lang="en">', '<html lang="de">'),
                     ('<link rel="canonical" href="%s/">' % BASE, '<link rel="canonical" href="%s/de/">' % BASE),
                     ('<meta property="og:url" content="%s/">' % BASE, '<meta property="og:url" content="%s/de/">' % BASE),
                     ('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="de_DE">'),
                     ('<meta property="og:locale:alternate" content="de_DE">',
                      '<meta property="og:locale:alternate" content="en_US">'),
                     ('data-lang-toggle>DE</button>', 'data-lang-toggle>EN</button>'),
                     ('>🎶 Play a beat</button>', '>🎶 %s</button>' % de['js']['beatPlay'])):
        if page.count(old) != 1:
            raise SystemExit('ERROR: index.html should contain %r exactly once' % old)
        page = page.replace(old, new)
    return page


def with_structured_data(page, version, description):
    """Complete the JSON-LD block with what changes per release and language."""
    m = LD.search(page)
    ld = json.loads(m.group(1))
    app = next(item for item in ld['@graph'] if item['@type'] == 'SoftwareApplication')
    app['softwareVersion'] = version
    app['description'] = description
    return page[:m.start(1)] + '\n' + json.dumps(ld, ensure_ascii=False, indent=2) + '\n' + page[m.end(1):]


def sitemap(lastmod, problems):
    """Both start pages (with their hreflang set) plus every other page that
    may be indexed, by its canonical URL. noindex pages stay out."""
    alternates = ''.join('\n    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (hl, BASE + path)
                         for hl, path in START_PAGES)
    urls = ['  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>%s\n  </url>' % (BASE + path, lastmod, alternates)
            for path in ('/', '/de/')]
    for fn in sorted(os.listdir(SITE)):
        if not fn.endswith('.html') or fn in ('index.html', '404.html'):
            continue
        page = read('site', fn)
        if re.search(r'<meta name="robots" content="[^"]*noindex', page):
            continue
        canonical = re.search(r'<link rel="canonical" href="([^"]+)">', page)
        if not canonical:
            problems.append('%s has neither a canonical link nor noindex' % fn)
            continue
        urls.append('  <url>\n    <loc>%s</loc>\n  </url>' % canonical.group(1))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + '\n'.join(urls) + '\n</urlset>\n')


ASSET_REF = re.compile(r'((?:src|href)=")(/[A-Za-z0-9_./-]+\.(?:js|css))(")')


def fingerprint_assets():
    """Point every page at /file.js?v=<content hash> so each deploy's pages
    fetch the scripts and styles that belong to them."""
    hashes = {}

    def versioned(m):
        path = m.group(2)
        if path not in hashes:
            with open(os.path.join(OUT, path.lstrip('/')), 'rb') as f:
                hashes[path] = hashlib.sha256(f.read()).hexdigest()[:10]
        return m.group(1) + path + '?v=' + hashes[path] + m.group(3)

    for dirpath, _, files in os.walk(OUT):
        for fn in files:
            if fn.endswith('.html'):
                path = os.path.join(dirpath, fn)
                with open(path, encoding='utf-8') as f:
                    page = f.read()
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(ASSET_REF.sub(versioned, page))
    return len(hashes)


def write(rel, text):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def main():
    problems = []

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SITE, OUT)
    os.makedirs(os.path.join(OUT, 'src'))
    for name in ENGINE:
        shutil.copy(os.path.join(ROOT, 'src', name), os.path.join(OUT, 'src', name))
    shutil.copytree(os.path.join(ROOT, 'audio'), os.path.join(OUT, 'audio'))
    shutil.copytree(os.path.join(ROOT, 'icons'), os.path.join(OUT, 'icons'))
    os.remove(os.path.join(OUT, 'de.json'))   # bundled into data.js below

    manifest = json.loads(read('manifest.json'))
    models_js = read('src', 'models.js')
    popup_js = read('popup', 'popup.js')
    models = re.findall(r"^\s+id: '([a-z-]+)', name:", models_js, re.M)
    seasonal = len(re.findall(r"^\s+season: \{", models_js, re.M))
    hats = len(re.findall(r"kind: 'hat'", models_js))
    glasses = len(re.findall(r"kind: 'glasses'", models_js))
    achievements = len(re.findall(r"^\s+\['", block(popup_js, 'var ACHIEVEMENTS = ['), re.M))
    tricks = len(re.findall(r"\['[a-z]+', '", block(popup_js, 'var TRICKS = [')))

    names = {'en': names_from('en'), 'de': names_from('de')}
    for mid in models:
        for loc in ('en', 'de'):
            if mid not in names[loc]:
                problems.append('model %s has no name in _locales/%s' % (mid, loc))

    # The wishing pond needs a Turnstile site key. On Cloudflare it comes from the
    # build environment (TURNSTILE_SITE_KEY); without one the pond section stays
    # hidden. Locally the always-passing test key keeps the board testable.
    turnstile_key = os.environ.get('TURNSTILE_SITE_KEY', '')
    if not turnstile_key and not os.environ.get('CF_PAGES'):
        turnstile_key = '1x00000000000000000000AA'
    if not turnstile_key:
        print('note: TURNSTILE_SITE_KEY not set, the wishing pond stays hidden on this deployment')
    de = json.loads(read('site', 'de.json'))
    index = read('site', 'index.html')
    index_de, en_dom = translate_page(index, de['dom'])
    data = {
        'meta': {
            'version': manifest['version'],
            'models': len(models), 'seasonal': seasonal,
            'achievements': achievements, 'tricks': tricks,
            'hats': hats, 'glasses': glasses,
            'built': datetime.date.today().isoformat(),
            'turnstileSiteKey': turnstile_key
        },
        'names': names,
        'en': {'dom': en_dom},
        'de': de
    }
    with open(os.path.join(OUT, 'data.js'), 'w', encoding='utf-8') as f:
        f.write('/* generated by tools/site_build.py */\nwindow.CD_DATA = '
                + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

    # i18n parity: every key in the markup needs a German string
    used = set()
    for fn in os.listdir(SITE):
        if fn.endswith('.html'):
            used.update(re.findall(r'data-i18n(?:-ph|-content)?="([^"]+)"', read('site', fn)))
    missing = sorted(used - set(de['dom']))
    unused = sorted(set(de['dom']) - used)
    if missing:
        problems.append('German strings missing for: ' + ', '.join(missing))
    if unused:
        print('note: German strings not used in any page: ' + ', '.join(unused))
    js_keys = set()
    for fn in os.listdir(SITE):
        if fn.endswith('.js') and 'var STR_EN = {' in read('site', fn):
            js_keys.update(re.findall(r"^\s{4}([A-Za-z_0-9]+): '",
                                      block(read('site', fn), 'var STR_EN = {', '\n  };'), re.M))
    js_missing = sorted(js_keys - set(de['js']))
    if js_missing:
        problems.append('German JS strings missing for: ' + ', '.join(js_missing))

    releases = json.loads(read('site', 'releases.json'))
    if not releases or releases[0]['version'] != manifest['version']:
        # tools/build.py archives the entry with the release commit; until then
        # the update page's strings stand in, so a deploy never waits for the log
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import release_log
        releases.insert(0, release_log.generate(manifest['version']))
        with open(os.path.join(OUT, 'releases.json'), 'w', encoding='utf-8') as f:
            json.dump(releases, f, ensure_ascii=False, indent=2)
        print('note: duck log entry for %s generated from the update page strings '
              '(python3 tools/release_log.py archives it)' % manifest['version'])
    for r in releases:
        for k in ('version', 'date', 'title', 'items'):
            if k not in r:
                problems.append('release %s lacks "%s"' % (r.get('version', '?'), k))
        if len(r.get('items', {}).get('en', [])) != len(r.get('items', {}).get('de', [])):
            problems.append('release %s: en/de item count differs' % r.get('version', '?'))

    declared = set(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', index))
    if declared != set((hl, BASE + path) for hl, path in START_PAGES):
        problems.append('the hreflang links in index.html differ from START_PAGES')
    write('index.html', with_structured_data(index, manifest['version'], en_dom['content:metaDesc']))
    write(os.path.join('de', 'index.html'),
          with_structured_data(german_start_page(index_de, de), manifest['version'], de['dom']['metaDesc']))
    # the start pages change with every release: version, duck log, counts
    write('sitemap.xml', sitemap(releases[0]['date'], problems))

    if problems:
        for p in problems:
            print('ERROR: ' + p)
        sys.exit(1)
    fingerprinted = fingerprint_assets()

    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print('cursorduck.com %s: %d models (%d seasonal), %d achievements, %d trick buttons, '
          '%d hats, %d glasses, %d fingerprinted assets -> _site/ (%d KB)'
          % (manifest['version'], len(models), seasonal, achievements, tricks, hats, glasses,
             fingerprinted, size // 1024))


if __name__ == '__main__':
    main()
