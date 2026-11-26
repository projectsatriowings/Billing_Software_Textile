import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

function getPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test('Android app icon: verify AndroidManifest configuration', () => {
  const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
  assert.ok(fs.existsSync(manifestPath), 'AndroidManifest.xml must exist');
  const xml = fs.readFileSync(manifestPath, 'utf8');

  assert.ok(xml.includes('android:icon="@mipmap/ic_launcher"'), 'Must configure ic_launcher');
  assert.ok(xml.includes('android:roundIcon="@mipmap/ic_launcher_round"'), 'Must configure ic_launcher_round');
});

test('Android app icon: verify adaptive icon XML and background color', () => {
  const resDir = path.resolve('android/app/src/main/res');

  const icLauncherXml = path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher.xml');
  const icLauncherRoundXml = path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher_round.xml');
  const backgroundXml = path.join(resDir, 'values', 'ic_launcher_background.xml');

  assert.ok(fs.existsSync(icLauncherXml), 'ic_launcher.xml must exist');
  assert.ok(fs.existsSync(icLauncherRoundXml), 'ic_launcher_round.xml must exist');
  assert.ok(fs.existsSync(backgroundXml), 'ic_launcher_background.xml must exist');

  const bgContent = fs.readFileSync(backgroundXml, 'utf8');
  assert.ok(bgContent.includes('#FFFFFF'), 'Background color must be clean white (#FFFFFF)');

  const launcherContent = fs.readFileSync(icLauncherXml, 'utf8');
  assert.ok(launcherContent.includes('@color/ic_launcher_background'), 'Must reference white background');
  assert.ok(launcherContent.includes('@mipmap/ic_launcher_foreground'), 'Must reference foreground mipmap');
});

test('Android app icon: verify legacy conflicting vectors are purged', () => {
  const resDir = path.resolve('android/app/src/main/res');
  const oldForegroundVec = path.join(resDir, 'drawable-v24', 'ic_launcher_foreground.xml');
  const oldBackgroundVec = path.join(resDir, 'drawable', 'ic_launcher_background.xml');

  assert.ok(!fs.existsSync(oldForegroundVec), 'Old alien vector drawable-v24/ic_launcher_foreground.xml must be removed');
  assert.ok(!fs.existsSync(oldBackgroundVec), 'Old grid vector drawable/ic_launcher_background.xml must be removed');
});

test('Android app icon: verify all densities have correct launcher, round, and adaptive dimensions', () => {
  const resDir = path.resolve('android/app/src/main/res');

  const densities = [
    { folder: 'mipmap-mdpi', legacy: 48, adaptive: 108 },
    { folder: 'mipmap-hdpi', legacy: 72, adaptive: 162 },
    { folder: 'mipmap-xhdpi', legacy: 96, adaptive: 216 },
    { folder: 'mipmap-xxhdpi', legacy: 144, adaptive: 324 },
    { folder: 'mipmap-xxxhdpi', legacy: 192, adaptive: 432 },
  ];

  for (const { folder, legacy, adaptive } of densities) {
    const dir = path.join(resDir, folder);
    assert.ok(fs.existsSync(dir), `Directory ${folder} must exist`);

    const standardPath = path.join(dir, 'ic_launcher.png');
    const roundPath = path.join(dir, 'ic_launcher_round.png');
    const foregroundPath = path.join(dir, 'ic_launcher_foreground.png');

    assert.ok(fs.existsSync(standardPath), `ic_launcher.png must exist in ${folder}`);
    assert.ok(fs.existsSync(roundPath), `ic_launcher_round.png must exist in ${folder}`);
    assert.ok(fs.existsSync(foregroundPath), `ic_launcher_foreground.png must exist in ${folder}`);

    const standardDim = getPngDimensions(standardPath);
    assert.strictEqual(standardDim.width, legacy, `${folder}/ic_launcher width must be ${legacy}`);
    assert.strictEqual(standardDim.height, legacy, `${folder}/ic_launcher height must be ${legacy}`);

    const roundDim = getPngDimensions(roundPath);
    assert.strictEqual(roundDim.width, legacy, `${folder}/ic_launcher_round width must be ${legacy}`);
    assert.strictEqual(roundDim.height, legacy, `${folder}/ic_launcher_round height must be ${legacy}`);

    const adaptiveDim = getPngDimensions(foregroundPath);
    assert.strictEqual(adaptiveDim.width, adaptive, `${folder}/ic_launcher_foreground width must be ${adaptive}`);
    assert.strictEqual(adaptiveDim.height, adaptive, `${folder}/ic_launcher_foreground height must be ${adaptive}`);
  }
});
