# SheetJS Community Edition 0.20.3

The Excel import worker uses the unmodified browser bundle `xlsx.full.min.cjs`.
It is stored here to keep builds independent of the SheetJS CDN. The bundle
from `@e965/xlsx@0.20.3` on the npm registry was verified byte-for-byte
against the SheetJS bundle already embedded in the application's checked-in
HTML release.

SHA-256 of `xlsx.full.min.cjs`:
`cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.

The accompanying Apache 2.0 license is included in the standalone build.
