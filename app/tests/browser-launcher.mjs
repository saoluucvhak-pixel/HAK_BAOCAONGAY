import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export function launchChromium() {
  const legacyPath = '/opt/pw-browsers/chromium';
  const executablePath = process.env.CHROMIUM_PATH ||
    (existsSync(legacyPath) ? legacyPath : undefined);
  return chromium.launch({ executablePath });
}
