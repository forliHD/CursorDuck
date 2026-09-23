#!/usr/bin/env python3
"""Turn the update page's "what's new" strings into a duck-log entry.

The extension's update page (welcome/update.html) lists the new tricks of the
current version in both languages through the locale keys uF<n>b / uF<n>t,
and uLogTitle carries a short release title. This module turns them into the
JSON shape of site/releases.json, so the website's changelog never needs a
hand-written entry:

  * tools/build.py calls archive() while packaging a release, so the version
    bump commit carries the entry;
  * tools/site_build.py calls generate() as a fallback while the newest entry
    is still missing, so a deploy never waits for the log.

    python3 tools/release_log.py        # archive the manifest version now
"""
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'site', 'releases.json')


def _messages(locale):
    with open(os.path.join(ROOT, '_locales', locale, 'messages.json'), encoding='utf-8') as fh:
        return json.load(fh)


def _items(msgs):
    out = []
    for n in range(1, 40):
        head = msgs.get('uF%db' % n)
        text = msgs.get('uF%dt' % n)
        if not head or not text:
            break
        out.append((head['message'].strip() + ' ' + text['message'].strip()).strip())
    return out


def _title(msgs, items):
    key = msgs.get('uLogTitle')
    if key and key['message'].strip():
        return key['message'].strip()
    labels = [re.sub(r'\s*[:：]\s*$', '', it.split(':')[0]) for it in items[:2]]
    return ' & '.join(l for l in labels if l) or 'Update'


def generate(version, date=None):
    """The releases.json entry for `version`, built from both locale files."""
    en, de = _messages('en'), _messages('de')
    items_en, items_de = _items(en), _items(de)
    if not items_en or len(items_en) != len(items_de):
        raise SystemExit('release log: uF<n>b/uF<n>t keys differ between en (%d) and de (%d)'
                         % (len(items_en), len(items_de)))
    return {
        'version': version,
        'date': date or datetime.date.today().isoformat(),
        'github': True,
        'title': {'en': _title(en, items_en), 'de': _title(de, items_de)},
        'items': {'en': items_en, 'de': items_de}
    }


def archive(version, date=None):
    """Prepend the entry for `version` to site/releases.json unless it is there."""
    with open(LOG, encoding='utf-8') as fh:
        releases = json.load(fh)
    if any(r.get('version') == version for r in releases):
        return False
    releases.insert(0, generate(version, date))
    with open(LOG, 'w', encoding='utf-8') as fh:
        json.dump(releases, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    return True


if __name__ == '__main__':
    with open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8') as fh:
        current = json.load(fh)['version']
    if archive(current):
        print('duck log: added %s to site/releases.json' % current)
    else:
        print('duck log: %s is already in site/releases.json' % current)
    sys.exit(0)
