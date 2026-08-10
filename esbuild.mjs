import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const test = process.argv.includes('--test');

async function main() {
  if (test) {
    await build({
      entryPoints: ['test/*.test.ts'],
      outdir: 'dist-test',
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node18',
      packages: 'external',
      sourcemap: true,
    });
    return;
  }

  const options = {
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.cjs',
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['vscode'],
    sourcemap: true,
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
  } else {
    await build(options);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});