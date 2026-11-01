# Licences of everything FruitGPT ships

| Part | Licence | Notes |
|---|---|---|
| FruitGPT code | MIT (see `LICENSE`) | |
| Fruit fly brain data | **CC BY 4.0** | MaleCNS v1.0 connectome. Not stored in this repository: downloaded from Janelia's public bucket at build time, converted, and bundled inside the apps. |
| Electron | MIT | Chromium and Node.js components under their own licences, included in each app as `LICENSES.chromium.html` |
| Online answers | Wikipedia text, **CC BY-SA 4.0** | Fetched live only when "Online answers" is on; every answer links to its source page. |

## Brain data attribution (required by CC BY 4.0)

The connectome is the **MaleCNS v1.0** dataset: the complete central nervous system of an adult male
*Drosophila melanogaster*, produced by HHMI Janelia (FlyEM), Google, and collaborators, published in *Cell* (2026)
as "Sexual dimorphism in the complete *Drosophila* male central nervous system connectome".
Data: https://male-cns.janelia.org · Licence: https://creativecommons.org/licenses/by/4.0/

**Changes made:** kept only neurons with status "Traced"; kept connections between those neurons; merged
neurotransmitter predictions; estimated 3D positions for neurons without a measured soma; converted to flat binary arrays.

## Names

FruitGPT is an independent project. It is not affiliated with or endorsed by OpenAI, HHMI Janelia, Google or the
Wikimedia Foundation. "GPT" in the name is a playful nod; FruitGPT does not use a language model.
