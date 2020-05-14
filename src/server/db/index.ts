import { InMemory } from './inmemory';
import { FlatFile } from './flatfile';
import { LocalStorage } from './localstorage';
const DBFromEnv = () => {
  if (process.env.FLATFILE_DIR) {
    return new FlatFile({
      dir: process.env.FLATFILE_DIR,
    });
  } else {
    return new InMemory();
  }
};

export { InMemory, FlatFile, LocalStorage, DBFromEnv };
