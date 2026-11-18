import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

async function build() {
  const distDir = path.resolve('client/dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy public assets
  const publicDir = path.resolve('client/public');
  if (fs.existsSync(publicDir)) {
    for (const f of fs.readdirSync(publicDir)) {
      fs.copyFileSync(path.join(publicDir, f), path.join(distDir, f));
    }
  }

  const isDev = process.env.NODE_ENV === 'development';
  console.log(`Bundling client with esbuild (mode: ${isDev ? 'development' : 'production - minified'})...`);

  await esbuild.build({
    entryPoints: ['client/src/index.tsx'],
    bundle: true,
    outfile: 'client/dist/bundle.js',
    minify: !isDev,
    treeShaking: true,
    legalComments: 'none',
    sourcemap: isDev,
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    },
  });

  console.log('✅ Client built successfully to client/dist');
}

build().catch((err) => {
  console.error('Client build failed:', err);
  process.exit(1);
});
