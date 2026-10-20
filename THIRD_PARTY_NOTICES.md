# Third-Party Notices

本项目使用或分发了以下第三方组件。各组件版权归其作者所有，并按其许可证使用。

## Runtime and bundled components

| Component | Version | License | Copyright / notes |
| --- | --- | --- | --- |
| Python | 3.10 | Python Software Foundation License | Copyright (c) Python Software Foundation. Full text: `licenses/Python-LICENSE.txt`. |
| pywebview | 6.2.1 | BSD 3-Clause | Copyright (c) 2014-2017, Roman Sirokov. Full text: `licenses/pywebview-LICENSE.txt`. |
| pythonnet | 3.1.0 | MIT | Full text: `licenses/pythonnet-LICENSE.txt`. |
| clr_loader | 0.3.1 | MIT | Full text: `licenses/clr_loader-LICENSE.txt`. |
| setuptools | 63.2.0 | MIT | Bundled by PyInstaller. Full text: `licenses/setuptools-LICENSE.txt`. |
| bottle | 0.13.4 | MIT | Optional pywebview dependency. Full text: `licenses/bottle-LICENSE.txt`. |

## Build-time components (not required at runtime)

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| PyInstaller | 6.22.3 | GPL-2.0-or-later with bootloader exception | The exception permits distributing bundled executables under terms of your choice. Full text: `licenses/PyInstaller-COPYING.txt`. |
| Pillow | 10+ | HPND / PIL-style | Used only by `tools/make_icon.py` to generate the application icon. |
| pyinstaller-hooks-contrib | 2026.8 | Apache-2.0 | Build-time hooks. |

## Front-end

| Component | Version | License |
| --- | --- | --- |
| CodeMirror | 5.65.16 | MIT. Copyright (C) 2016 by Marijn Haverbeke and others. Full text: `licenses/CodeMirror-LICENSE.txt`. |

## Fonts and assets

- The application uses system fonts (Microsoft YaHei UI / Segoe UI / Consolas) and does not redistribute font files.
- `assets/app.ico` and `assets/app.png` are original artwork for this project.

## Notes on the PyInstaller exception

PyInstaller is licensed under GPL-2.0-or-later, with a special exception that allows
building and distributing bundled applications without placing those applications
under the GPL. The bundled Python runtime and third-party packages remain under
their own licenses. See `licenses/PyInstaller-COPYING.txt` for the exact terms.

If you distribute a Windows build, include the `LICENSE`, `LICENSE-CONTENT`,
`THIRD_PARTY_NOTICES.md`, and `licenses/` directory alongside the executable.
