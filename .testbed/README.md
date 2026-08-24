# Standard Package Testbed

This hidden testbed owns repo-local tests, demos, scenes, debug data, browser validation, and generated local dependency symlinks.

Create `.testbed/node_modules/@aerobeat/web-this-repo` as a local symlink to `../../../src` when validating a concrete package. Add sibling `@aerobeat/web-*` symlinks only for declared public package dependencies.
