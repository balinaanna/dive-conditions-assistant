# Vendored browser libraries

These files are committed so the deployed widget does not depend on a
third-party CDN at runtime.

| Library | Version | Local asset |
| --- | --- | --- |
| Bootstrap | 5.3.8 | `bootstrap/bootstrap.min.css` |
| Chart.js | 4.5.1 | `chart.js/chart.umd.min.js` |
| chartjs-adapter-date-fns | 3.0.0 | `chartjs-adapter-date-fns/chartjs-adapter-date-fns.bundle.min.js` |

Each library is distributed under the MIT License. Its upstream license notice
is stored beside the corresponding asset.

When updating a library, replace both its asset and license notice, update the
version in this file, run the complete test suite, and visually smoke-test the
chart.
