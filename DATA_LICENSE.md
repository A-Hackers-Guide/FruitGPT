# Licences of everything FruitGPT ships

| Part | Licence | Notes |
|---|---|---|
| FruitGPT code | MIT (see `LICENSE`) | |
| Male fruit fly brain data | **CC BY 4.0** | MaleCNS v1.0 connectome. |
| Female fruit fly brain data | **CC BY 4.0** | FlyWire v783 connectome and annotations. |
| Worm brain data | **CC BY 4.0** (wiring) · **MIT** (positions) | Varshney et al. 2011 wiring via OpenWorm ConnectomeToolbox; soma positions from OpenWorm c302. |
| three.js (Brain Editor 3D view) | MIT | `src/renderer/vendor/THREE_LICENSE.txt` |
| *(all brain data)* | | Not stored in this repository: downloaded from the sources at build time, converted, and bundled inside the apps. |
| Electron | MIT | Chromium and Node.js components under their own licences, included in each app as `LICENSES.chromium.html` |
| Online answers | Wikipedia text, **CC BY-SA 4.0** | Fetched live only when "Online answers" is on; every answer links to its source page. |

## Brain data attribution (required by CC BY 4.0)

The connectome is the **MaleCNS v1.0** dataset: the complete central nervous system of an adult male
*Drosophila melanogaster*, produced by HHMI Janelia (FlyEM), Google, and collaborators, published in *Cell* (2026)
as "Sexual dimorphism in the complete *Drosophila* male central nervous system connectome".
Data: https://male-cns.janelia.org · Licence: https://creativecommons.org/licenses/by/4.0/

**Changes made:** kept only neurons with status "Traced"; kept connections between those neurons; merged
neurotransmitter predictions; estimated 3D positions for neurons without a measured soma; converted to flat binary arrays.

### FlyWire (female fruit fly brain)

The **FlyWire whole-brain connectome, release 783**, by the FlyWire Consortium: Dorkenwald et al. 2024,
"Neuronal wiring diagram of an adult brain", and Schlegel et al. 2024, "Whole-brain annotation and multi-connectome
cell typing of *Drosophila*", both *Nature* 634. Connections: https://zenodo.org/records/10676866 (CC BY 4.0).
Annotations: https://github.com/flyconnectome/flywire_annotations (Supplemental file 1 of Schlegel et al. 2024, CC BY 4.0).

**Changes made:** summed synapse counts over brain regions; kept neuron pairs with at least 5 synapses; chose each neuron's
transmitter (a confirmed one when listed first, else the prediction); renamed super classes to the MaleCNS names;
converted coordinates to micrometres; converted to flat binary arrays.

### C. elegans (worm)

Wiring: Varshney, Chen, Paniagua, Hall & Chklovskii 2011, "Structural properties of the *Caenorhabditis elegans*
neuronal network", *PLoS Computational Biology* 7(2): e1001066 (CC BY), as distributed in OpenWorm's ConnectomeToolbox
(https://github.com/openworm/ConnectomeToolbox, MIT). Neuron positions: OpenWorm c302 (https://github.com/openworm/c302, MIT).
Cell categories: WormAtlas descriptions as included in ConnectomeToolbox.

**Changes made:** used chemical synapses and gap junctions (gap junctions as weak excitatory links, left out for GABA neurons);
marked the 26 GABAergic neurons (McIntire et al. 1993) as inhibitory and all others as excitatory; normalised names (VA01 → VA1);
converted to flat binary arrays.

## Names

FruitGPT is an independent project. It is not affiliated with or endorsed by OpenAI, HHMI Janelia, Google, the FlyWire
Consortium, OpenWorm or the Wikimedia Foundation. "GPT" in the name is a playful nod; FruitGPT does not use a language model.
