# Verified original-project references

The uploaded Windows build's `app.info` says company `Helvest`, product `Reverse Falls The Game`. Its EXE version is Unity 2019.2.20f1. These local findings connect to the following public creator sources, although exact equivalence of later web builds to the uploaded Chapter 0 has not been established.

- https://github.com/Helvest — public profile identifies Helvest as a game designer and game developer. Links https://sites.google.com/view/helvest.
- https://github.com/Helvest/RF_Web — public website repository, master at `28f1cdcd06e035d0ecb470f2c5aee3482c9b0fd3`, created December 2022. GitHub Pages points to https://reversefalls.com/.
- https://raw.githubusercontent.com/Helvest/RF_Web/master/index.html — title `Reverse Falls Open Project`; page says it is under construction and is signed `Helvest, your humble Dev Director from Giddy Fresh Studios.` It links https://linktr.ee/reversefalls.
- https://github.com/Helvest/RF_Web_Beta — public deployed-build repository, master at `a665ff9243ed3d6f0c76729da2dddc73e11a067b`; directories include `Build`, `StreamingAssets/aa`, `VNData`, `TemplateData`. GitHub Pages points to https://beta.reversefalls.com/.
- https://raw.githubusercontent.com/Helvest/RF_Web_Beta/master/index.html — Unity WebGL page title/product `Reverse Falls Open Project`, company `Helvest`, product version `1.0`. It references RF_Web_Beta loader/data/framework/wasm assets.

No public C# original-source repository or abandonment status was verified. Earlier `nkrth/Reverse-Falls` and candidate `unidivision.itch.io/reverse-falls` are not authoritative for this uploaded build and should not be presented as its source. The main and beta sites were identified from GitHub metadata, not tested live (their domains are not currently in the applied allowlist).

Inspected all 23 public repositories returned by the paginated `user:Helvest` GitHub repository search. Only `RF_Web` and `RF_Web_Beta` matched the game; the remainder were unrelated games, physics/network experiments, or general-purpose Unity packages. None was identified as the original 2019/2020 Chapter 0 C# project.
