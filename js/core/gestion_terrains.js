import {dialog} from '../display/displayers.js'
import {CURRENCY} from "./monopoly.js";
import {GestionJoueur} from "./gestion_joueurs.js";
import {infoMessage} from "../display/message.js";
import {GestionConstructions} from "./gestion_constructions.js";
import {GestionFiche} from "../display/case_jeu.js";
import {bus} from "../bus_message.js";

/* Panneau de gestion des terrains */

const GestionTerrains = {
    maisonsToLever: [],
    changesConstructions: [],
    cout: 0,
    totalRestant: 0,
    divCout: null,
    divArgentRestant: null,
    banqueroute: false,
    panel: null,
    beforeClose:()=>true,
    /* Remet a 0 le panneau */
    open: function (banqueroute, onclose = () => true) {
        this.banqueroute = banqueroute;
        this.beforeClose = onclose;
        this.load();
        dialog.open(this.panel, {
            title: 'Gestion des maison', width: 800, height: 600, buttons: {
                'Fermer': () => this.closePanel(),
                "Valider": () => this.valider()
            }
        });
    },
    reset: function () {
        this.Hypotheque.reset();
        this.LeverHypotheque.reset();
        this.Constructions.reset();
        this.cout = 0;
        document.querySelector('#coutAchats > span[name]').innerHTML = '0';
        document.querySelector('.currency-value').innerHTML = CURRENCY;
        this.update();
    },
    init: function (config) {
        this.divArgentRestant = document.querySelector(config.idArgentRestant);
        this.divCout = document.querySelector(config.idCout);
        this.Hypotheque.init(config.idTerrains, config.idHypotheque);
        this.LeverHypotheque.init(config.idTerrainsHypotheque);
        this.Constructions.init(config.idTerrainsConstructibles, config.idCoutAchat, config.idConstructions);
        this.panel = document.querySelector(config.idPanel);
    },
    /* Charge les informations */
    load: function () {
        this.reset();
        this.Hypotheque.load();
        this.LeverHypotheque.load();
        this.Constructions.load();
    },
    /* Modifie le cout global */
    addCout: function (montant) {
        this.cout += montant;
        this.update();
    },
    /* Mets a jour le panneau */
    update: function () {
        // On mets a jour les maisons, si on ajoute, on ne peut pas hypothequer
        this.Hypotheque.update();
        let totals = this.Constructions.update();
        this.divCout.innerHTML = `${this.cout - totals.cout} ${CURRENCY}`;
        this.totalRestant = GestionJoueur.getJoueurCourant().montant + this.cout - totals.cout;
        this.divArgentRestant.innerHTML = `${this.totalRestant} ${CURRENCY}`;
    },
    verify: function () {
        try {
            if (GestionTerrains.totalRestant < 0) {
                throw "Operation impossible : pas assez d'argent";
            }
            GestionTerrains.Constructions.verify();
            return true;
        } catch (e) {
            infoMessage.create(GestionJoueur.getJoueurCourant(), "Attention", "red", e);
            console.trace(e);
            return false;
        }
    },
    valider: function () {
        if (!this.verify()) {
            return;
        }
        this.Constructions.vendre();
        this.Hypotheque.valider();
        this.LeverHypotheque.valider();
        this.Constructions.acheter();

        this.closePanel();
    },
    closePanel: function () {
        if(!this.beforeClose()){
            return;
        }
        dialog.close();
    },
    /* Gere l'hypotheque de terrain */
    Hypotheque: {
        table: [],
        select: null,
        div: null,
        init: function (idTerrains, idHypotheque) {
            this.select = document.querySelector(`${idTerrains} select`);
            this.div = document.querySelector(idHypotheque);
        },
        reset: function () {
            this.table = [];
            this.select.innerHTML = "";
            this.div.innerHTML = '';
            document.getElementById('idHypothequeAction').onclick = () => this.add();
        },
        valider: function () {
            // On recupere les fiches et on hypotheque les biens
            for (const id in this.table) {
                this.table[id].hypotheque();
            }
        },
        update: function () {
            this.select.querySelectorAll('option[data-color]').forEach(d=>d.removeAttribute('disabled'));

            // On desactive les propriete qui ont des terrains construits
            GestionTerrains.Constructions.getGroupesConstruits().forEach(color=>{
                this.select.querySelectorAll(`option[data-color="${color}"]`).forEach(a=>a.setAttribute('disabled','disabled'))
            })
        },
        /* Charge les terrains hypothequables */
        load: function () {
            GestionJoueur.getJoueurCourant().maisons
                .findMaisonsHypothecables()
                .forEach(function (m) {
                    GestionTerrains.Hypotheque.addOption(m);
                });
        },
        addGroup: function (group) {
            group.proprietes.forEach(g => this.addOption(g));
        },
        addOption: function (fiche) {
            // On verifie si l'option n'existe pas
            if (this.select.querySelectorAll(`option[value="${fiche.id}"]`).length > 0) {
                return;
            }
            let option = `<option data-color='${fiche.color}' value='${fiche.id}'>${fiche.nom} (${fiche.montantHypotheque} ${CURRENCY})</option>`;
            this.select.insertAdjacentHTML('beforeend',option);
        },
        /* Ajoute une propriete aux hypotheques */
        add: function () {
            const fiche = GestionFiche.getById(this.select.value);
            this.table[fiche.id] = fiche;
            const div = document.createElement('div');
            div.append(document.createTextNode(fiche.nom));

            const buttonAnnuler = document.createElement('button');
            buttonAnnuler.append(document.createTextNode('Annuler'));
            buttonAnnuler.style.setProperty('margin-right','5px');
            buttonAnnuler.onclick = () => {
                this.addOption(fiche);
                buttonAnnuler.parentNode.remove();
                GestionTerrains.addCout(-fiche.montantHypotheque);
                delete this.table[fiche.id];
                // On permet l'achat de maison sur les terrains si aucune maison hypotheque
                // On prend toutes les couleurs et on les elimine
                let colors = Object.values(this.table).map(o=>o.color.substring(1));
                GestionTerrains.Constructions.showByColors(colors);
            };
            div.prepend(buttonAnnuler);
            this.div.append(div)
            this.select.querySelector(`option[value="${fiche.id}"]`).remove();
            GestionTerrains.addCout(fiche.montantHypotheque);
            // On empeche l'achat de maisons sur les terrains de ce groupe
            GestionTerrains.Constructions.removeByColor(fiche.color);
        }
    },
    LeverHypotheque: {
        div: null,
        table: [],
        init: function (idTerrains) {
            //this.div = $(idTerrains + ' > div');
            this.div = document.querySelector(`${idTerrains} > div`);
        },
        reset: function () {
            //this.div.empty();
            this.div.innerHTML = '';
            this.table = [];
        },
        valider: function () {
            for (const id in this.table) {
                this.table[id].leveHypotheque();
            }
        },
        load: function () {
            GestionJoueur.getJoueurCourant().maisons.findMaisonsHypothequees().forEach(fiche => {
                const div = document.createElement('div');
                div.append(document.createTextNode(fiche.nom));

                const boutonLever = document.createElement('button');
                boutonLever.style.setProperty('margin-right','5px');
                boutonLever.append(document.createTextNode('Lever'));
                //let boutonLever = $('<button style="margin-right:5px">Lever</button>');
                boutonLever.onclick = () => GestionTerrains.LeverHypotheque.lever(boutonLever, fiche);
                div.prepend(boutonLever);
                GestionTerrains.LeverHypotheque.div.append(div);
            })
            /*$(proprietes).each(function () {
                let fiche = this;
                let div = $("<div>" + this.nom + "</div>");
                let boutonLever = $('<button style="margin-right:5px">Lever</button>');
                boutonLever.click(function () {
                    GestionTerrains.LeverHypotheque.lever($(this), fiche);
                });
                div.prepend(boutonLever);
                GestionTerrains.LeverHypotheque.div.append(div);
            });*/
        },
        lever: function (input, fiche) {
            input.setAttribute('disabled', 'disabled');
            this.table.push(fiche);
            GestionTerrains.addCout(-Math.round(fiche.montantHypotheque * 1.1));
        },

    },
    Constructions: {
        table: [],
        div: null,
        infos: null,
        simulation: null, // Simulation d'achat pour evaluer la faisabilite
        resteConstructions: null,
        init: function (idTerrains, idCout, idConstructions) {
            this.div = document.querySelector(idTerrains);
            this.infos = document.querySelector(idCout);
            this.resteConstructions = document.querySelector(idConstructions);
        },
        /* Verifie pour la validation et renvoie une exception */
        verify: function () {
            // On verifie les terrains libres
            let testGroups = [];
            //$('select[data-color]', this.div).each(function () {
            this.div.querySelectorAll('select[data-color]').forEach(d=>{
                const color = d.getAttribute('data-color');
                if (testGroups[color] == null) {
                    testGroups[color] = {
                        min: 5,
                        max: 0
                    };
                }
                testGroups[color].min = Math.min(testGroups[color].min, d.value);
                testGroups[color].max = Math.max(testGroups[color].max, d.value);
            });
            for (const c in testGroups) {
                if (testGroups[c].max - testGroups[c].min > 1) {
                    throw "Il faut equilibrer les maisons";
                }
            }
            // On verifie sur la simulation est correcte
            if (this.simulation.reste.maison < 0 || this.simulation.reste.hotel < 0) {
                throw "Impossible d'acheter, il n'a y pas assez de maison / hotel disponibles";
            }
        },
        valider: function () {
            for (let achat in this.table) {
                let data = this.table[achat];
                data.propriete.setNbMaison(data.nbMaison);
                GestionJoueur.getJoueurCourant().payer(data.cout);
            }
            // On modifie les quantites de maisons / hotels
            this._doBuyConstructions();
        },
        _doBuyConstructions: function () {
            if (this.simulation != null && (this.simulation.achat.maison !== 0 || this.simulation.achat.hotel !== 0)) {
                GestionConstructions.buyHouses(this.simulation.achat.maison);
                GestionConstructions.buyHotels(this.simulation.achat.hotel);
                bus.send('monopoly.acheteConstructions', {
                    joueur: GestionJoueur.getJoueurCourant(),
                    achats: this.simulation.achat
                });
            }
        },
        acheter: function () {
            for (const achat in this.table) {
                let data = this.table[achat];
                if (data.propriete.nbMaison < data.nbMaison) {
                    data.propriete.setNbMaison(data.nbMaison);
                    GestionJoueur.getJoueurCourant().payer(data.cout);
                }
            }
            // On modifie les quantites de maisons / hotels
            this._doBuyConstructions();
        },
        vendre: function () {
            for (const achat in this.table) {
                let data = this.table[achat];
                if (data.propriete.nbMaison > data.nbMaison) {
                    data.propriete.setNbMaison(data.nbMaison);
                    GestionJoueur.getJoueurCourant().payer(data.cout);
                }
            }
        },
        reset: function () {
            this.table = [];
            this.div.innerHTML = '';
        },
        getGroupesConstruits: function () {
            return Array.from(this.div.querySelectorAll('select:has(option:not([value="0"]):checked)'))
                .map(d=>d.getAttribute('data-color')).reduce((s,color) => {s.add(color);return s},new Set());
        },
        update: function () {
            let totals = {
                nbMaison: 0,
                nbHotel: 0,
                cout: 0
            };
            let projects = [];
            for (let achat in this.table) {
                let fiche = GestionFiche.getById(achat);
                let project = {
                    from: {},
                    to: {},
                    group: fiche.color
                };
                if (fiche.hotel) {
                    project.from.type = "hotel";
                    project.from.nb = 1;
                } else {
                    project.from.type = "maison";
                    project.from.nb = parseInt(fiche.nbMaison);
                }
                let data = this.table[achat];
                totals.cout += data.cout;
                if (data.hotel > 0) {
                    project.to.type = "hotel";
                    project.to.nb = 1;
                } else {
                    project.to.type = "maison";
                    project.to.nb = data.nbMaison;
                }
                totals.nbMaison += data.nbMaison || 0;
                totals.nbHotel += data.hotel || 0;
                projects.push(project);
            }
            /* Simulation d'achat (reste maison) */
            /* Il faut construire la situation avant / apres */
            this.simulation = GestionConstructions.simulateBuy(projects);
            this.infos.querySelector('span.nbMaison').innerHTML = this.simulation.achat.maison;
            this.infos.querySelector('span.nbHotel').innerHTML = this.simulation.achat.hotel;
            this.resteConstructions.querySelector('span.nbMaison').innerHTML = this.simulation.reste.maison;
            this.resteConstructions.querySelector('span.nbHotel').innerHTML = this.simulation.reste.hotel;
            return totals;
        },
        /* Supprime la possibilite d'acheter des maisons sur les terrains de cette couleur */
        removeByColor: function (color) {
            this.div.querySelectorAll(`div[class*="-${color.substring(1)}"]`)
                .forEach(d=>d.style.setProperty('display','none'));
        },
        showByColors: function (excludeColors) {
            let selectors = "div";
            excludeColors.forEach(color => selectors += `:not([class*="-${color}"])`);
            this.div.querySelectorAll(selectors).forEach(d=>d.style.setProperty('display',''));
        },
        _displayProprietesOfGroup: function (group) {
            for (let index in group.proprietes) {
                const propriete = group.proprietes[index];
                const divTerrain = document.createElement('div');
                divTerrain.classList.add('propriete',`propriete-${propriete.color.substring(1)}`);
                divTerrain.insertAdjacentHTML('beforeend',`<span style="color:${propriete.color}" class="title-propriete">${propriete.nom}</span>`);

                const select = document.createElement('select');
                select.setAttribute('data-color',propriete.color);
                select.setAttribute('data-propriete',propriete.id);
                select.classList.add(propriete.nbMaison === 5 ? 'hotel' : 'maison');

                for (let j = 0; j <= ((GestionTerrains.banqueroute) ? propriete.nbMaison : 5); j++) {
                    select.insertAdjacentHTML('beforeend',`<option class="${j === 5 ? "hotel" : "maison"}" value="${j}" ${propriete.nbMaison === j ? "selected" : ""}>x ${j === 5 ? 1 : j}</option>`);
                }
                const span = document.createElement('span');
                select.onchange = () => {
                    let value = parseInt(select.value);
                    if (propriete.nbMaison === value) {
                        delete this.table[propriete.id];
                        span.innerHTML = "";
                        GestionTerrains.update();
                        return;
                    }
                    const data = (value === 5) ? {
                        hotel: 1
                    } : {
                        maison: value - propriete.nbMaison
                    };
                    data.propriete = propriete;
                    data.nbMaison = value;
                    data.cout = (value > propriete.nbMaison) ? (value - propriete.nbMaison) * propriete.prixMaison : (value - propriete.nbMaison) * propriete.prixMaison / 2;
                    select.removeAttribute('class');
                    select.classList.add(value === 5 ? 'hotel' : 'maison');
                    span.innerHTML = data.cout;
                    this.table[propriete.id] = data;
                    GestionTerrains.update();

                    // Si le groupe est vide, on permet l'hypotheque des terrains
                    if (this.div.querySelectorAll(`select[data-color="${propriete.color}"] option:checked:not([value="0"])`).length === 0) {
                        // Le groupe est hypothecable
                        GestionTerrains.Hypotheque.addGroup(group);
                    }
                }
                divTerrain.append(select);
                divTerrain.append(span);
                divTerrain.insertAdjacentHTML('beforeend',` ${CURRENCY}`);
                this.div.append(divTerrain)
            }
        },
        load: function () {
            let groups = GestionJoueur.getJoueurCourant().maisons.findConstructiblesGroupes();
            for (let color in groups) {
                const divTitre = `<div class="group-${color.substring(1)}">Groupe <span style="color:${color};font-weight:bold">${groups[color].group.nom}</span></div>`;
                this.div.insertAdjacentHTML('beforeend',divTitre);
                this._displayProprietesOfGroup(groups[color]);
            }
        }
    }
};

export {GestionTerrains};