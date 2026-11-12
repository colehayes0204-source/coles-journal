// Sets the .exe icon + version info without wine (pure-JS PE resource editing).
import * as ResEdit from 'resedit';
import * as PE from 'pe-library';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkgVersion = require('../package.json').version;
const [exe, ico] = process.argv.slice(2);
const exeObj = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exeObj);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, iconFile.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: "Cole's Journal", FileDescription: "Cole's Journal", CompanyName: 'Cole', OriginalFilename: 'ColesJournal.exe', InternalName: 'ColesJournal' });
  const parts = String(pkgVersion).split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 4) parts.push(0);
  vi.setFileVersion(parts[0], parts[1], parts[2], parts[3]);
  vi.setProductVersion(parts[0], parts[1], parts[2], parts[3]);
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exeObj);
fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
console.log('icon set on', exe);
