import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync
} from 'node:fs';
import { join } from 'node:path';
import { seed } from './core.js';

export function createStore(directory) {
  mkdirSync(directory, { recursive: true });

  const file = join(directory, 'store.json');
  let state = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : seed();

  if (
    state.version !== 1 ||
    !Array.isArray(state.records) ||
    !state.profile
  ) {
    throw new Error('Unsupported or damaged data file.');
  }

  function persist(next) {
    writeFileSync(
      file + '.tmp',
      JSON.stringify(next, null, 2),
      { mode: 0o600 }
    );
    renameSync(file + '.tmp', file);
    state = next;
  }

  if (!existsSync(file)) persist(state);

  return {
    read() {
      return structuredClone(state);
    },

    update(fn) {
      const next = structuredClone(state);
      const result = fn(next);
      persist(next);
      return result;
    }
  };
}
