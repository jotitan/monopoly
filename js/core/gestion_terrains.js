import {wrapDialog} from '../display/displayers.js'
import {CURRENCY} from "./monopoly.js";
import {GestionJoueur} from "./gestion_joueurs.js";
import {InfoMessage} from "../display/message.js";
import {GestionConstructions} from "./gestion_constructions.js";
import {GestionFiche} from "../display/case_jeu.js";
import {bus} from "../bus_message.js";

/* Panneau de gestion des terrains */

let GestionTerrains = {
    maisonsToLever: [],
    changesConstructions: [],
    cout: 0,
    totalRestant: 0,
    divCout: null,
    divArgentRestant: null,
    banqueroute: false,
    panel: null,
    /* Remet a 0 le panneau */
    open: function (banqueroute, onclose) {
        this.banqueroute = banqueroute;
        if (onclose) {
            this.panel.unbind('dialogbeforeclose').bind('dialogbeforeclose', onclose);
        } else {
            this.panel.unbind('dialogbeforeclose');
        }
        this.panel.dialog('open');
    },
    reset: function () {
        this.Hypotheque.reset();
        this.LeverHypotheque.reset();
        this.Constructions.reset();
        this.cout = 0;
        $('#coutAchats > span[name]').text(0);
        $('.currency-value').text(CURRENCY);
        this.update();
    },
    init: function (config) {
        this.divArgentRestant = $(config.idArgentRestant);
        this.divCout = $(config.idCout);
        this.Hypotheque.init(config.idTerrains,config.idHypotheque);
        this.LeverHypotheque.init(config.idTerrainsHypotheque);
        this.Constructions.init(config.idTerrainsConstructibles,config.idCoutAchat,config.idConstructions);
        this.panel = $(config.idPanel);
        //this.panel.dialog({
        wrapDialog(this.panel,{
            width: 800,
            height: 600,
            position: { my: "center top", at: "center top", of: window },
            title: 'Gestion des maisons',
            modal: true,
            buttons: {
                'Fermer': () =>this.closePanel(),
                "Valider": () =>this.valider()
            },
            autoOpen: false,
            // On charge les proprietes a hypothequer
            open: ()=>this.load()
        });
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
        this.divCout.text((this.cout - totals.cout) + " " + CURRENCY);
        this.totalRestant = GestionJoueur.getJoueurCourant().montant + this.cout - totals.cout;
        this.divArgentRestant.text((this.totalRestant) + " " + CURRENCY);
    },
    verify: function () {
        try {
            if (GestionTerrains.totalRestant < 0) {
                throw "Operation impossible : pas assez d'argent";
            }
            GestionTerrains.Constructions.verify();
        } catch (e) {
            InfoMessage.create(GestionJoueur.getJoueurCourant(),"Attention", "red", e);
            return false;
        }
        return true;
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
        this.panel.dialog('close');
    },
    /* Gere l'hypotheque de terrain */
    Hypotheque: {
        table: [],
        select: null,
        div: null,
        init: function (idTerrains,idHypotheque) {
            this.select = $('select',idTerrains);
            this.div = $(idHypotheque);
        },
        reset: function () {
            this.table = [];
            this.select.empty();
            this.div.empty();
            $('#idHypothequeAction').unbind('click').bind('click', function () {
                GestionTerrains.Hypotheque.add();
            });
        },
        valider: function () {
            // On recupere les fiches et on hypotheque les biens
            for (const id in this.table) {
                this.table[id].hypotheque();
            }
        },
        update: function () {
            $('option[data-color]', this.select).removeAttr('disabled');
            // On desactive les propriete qui ont des terrains construits
            let colors = GestionTerrains.Constructions.getGroupesConstruits();
            for (let i in colors) {
                $('option[data-color="' + colors[i] + '"]', this.select).attr('disabled', 'disabled');
            }
        },
        /* Charge les terrains hypothequables */
        load: function () {
            GestionJoueur.getJoueurCourant().maisons
                .findMaisonsHypothecables()
                .forEach(function(m){GestionTerrains.Hypotheque.addOption(m);});
        },
        addGroup: function (group) {
            group.proprietes.forEach(g=>this.addOption(g));
        },
        addOption: function (fiche) {
            // On verifie si l'option n'existe pas
            if (this.select.find('option[value="' + fiche.id + '"]').length > 0) {
                return;
            }
            let option = $("<option data-color='" + fiche.color + "' value='" + fiche.id + "'>" + fiche.nom + " (+" + fiche.montantHypotheque + " " + CURRENCY + ")</option>");
            option.data("fiche", fiche);
            this.select.append(option);
        },
        /* Ajoute une propriete aux hypotheques */
        add: function () {
            let terrain = $('option:selected', this.select);
            let fiche = terrain.data("fiche");
            this.table[fiche.id] = fiche;
            let div = $('<div>' + fiche.nom + '</div>');
            let boutonAnnuler = $('<button style="margin-right:5px">Annuler</button>');
            boutonAnnuler.click(() =>{
                this.addOption(fiche);
                $(this).parent().remove();
                GestionTerrains.addCout(-fiche.montantHypotheque);
                delete this.table[fiche.id];
                // On permet l'achat de maison sur les terrains si aucune maison hypotheque
                // On prend toutes les couleurs et on les elimine
                let colors = [];
                for (let id in this.table) {
                    colors.push(this.table[id].color.substring(1));
                }
                GestionTerrains.Constructions.showByColors(colors);
            });
            div.prepend(boutonAnnuler);
            this.div.append(div)
            $('option:selected', this.select).remove();
            GestionTerrains.addCout(fiche.montantHypotheque);
            // On empeche l'achat de maisons sur les terrains de ce groupe
            GestionTerrains.Constructions.removeByColor(fiche.color);
        }
    },
    LeverHypotheque: {
        div: null,
        table: [],
        init: function (idTerrains) {
            this.div = $(idTerrains + ' > div');
        },
        reset: function () {
            this.div.empty();
            this.table = [];
        },
        valider: function () {
            for (const id in this.table) {
                this.table[id].leveHypotheque();
            }
        },
        load: function () {
            let proprietes = GestionJoueur.getJoueurCourant().maisons.findMaisonsHypothequees();
            $(proprietes).each(function () {
                let fiche = this;
                let div = $("<div>" + this.nom + "</div>");
                let boutonLever = $('<button style="margin-right:5px">Lever</button>');
                boutonLever.click(function () {
                    GestionTerrains.LeverHypotheque.lever($(this), fiche);
                });
                div.prepend(boutonLever);
                GestionTerrains.LeverHypotheque.div.append(div);
            });
        },
        lever: function (input, fiche) {
            input.attr('disabled', 'disabled');
            this.table.push(fiche);
            GestionTerrains.addCout(-Math.round(fiche.montantHypotheque * 1.1));
        },

    },
    Constructions: {
        table: [],
        div: null,
        infos: null,
        simulation: null, // Simulation d'achat pour evaluer la faisabilite
        resteConstructions:null,
        init: function (idTerrains,idCout,idConstructions) {
            this.div = $(idTerrains);
            this.infos = $(idCout);
            this.resteConstructions = $(idConstructions);
        },
        /* Verifie pour la validation et renvoie une exception */
        verify: function () {
            // On verifie les terrains libres
            let testGroups = [];
            $('select[data-color]', this.div).each(function () {
                const color = $(this).get(0).dataset.color;
                if (testGroups[color] == null) {
                    testGroups[color] = {
                        min: 5,
                        max: 0
                    };
                }
                testGroups[color].min = Math.min(testGroups[color].min, $(this).val());
                testGroups[color].max = Math.max(testGroups[color].max, $(this).val());
            });
            for (let color in testGroups) {
                if (testGroups[color].max - testGroups[color].min > 1) {
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
        _doBuyConstructions:function(){
            if (this.simulation != null && (this.simulation.achat.maison!==0 || this.simulation.achat.hotel!==0)) {
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
                if(data.propriete.nbMaison < data.nbMaison){
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
                if(data.propriete.nbMaison > data.nbMaison){
                    data.propriete.setNbMaison(data.nbMaison);
                    GestionJoueur.getJoueurCourant().payer(data.cout);
                }
            }
        },
        reset: function () {
            this.table = [];
            this.div.empty();
        },
        getGroupesConstruits: function () {
            let colors = [];
            $('select[data-color]:has(option:selected[value!=0])', this.div).each(function () {
                colors.push($(this).attr('data-color'));
            });
            return colors;
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
            $('span[name="nbMaison"]', this.infos).text(this.simulation.achat.maison);
            $('span[name="nbHotel"]', this.infos).text(this.simulation.achat.hotel);
            $('span[name="nbMaison"]', this.resteConstructions).text(this.simulation.reste.maison);
            $('span[name="nbHotel"]', this.resteConstructions).text(this.simulation.reste.hotel);
            return totals;
        },
        /* Supprime la possibilite d'acheter des maisons sur les terrains de cette couleur */
        removeByColor: function (color) {
            this.div.find('div[class*="-' + color.substring(1) + '"]').hide();
        },
        showByColors: function (exludeColors) {
            let selectors = "div";
            for (let index in exludeColors) {
                selectors += ':not([class*="-' + exludeColors[index] + '"])';
            }
            this.div.find(selectors).show();
        },
        _displayProprietesOfGroup:function(group){
            for (let index in group.proprietes) {
                let propriete = group.proprietes[index];
                let divTerrain = $(`<div class="propriete propriete-${propriete.color.substring(1)}"></div>`);
                divTerrain.append(`<span style="color:${propriete.color}" class="title-propriete">${propriete.nom}</span>`);
                let select = $(`<select data-color="${propriete.color}" class="${((propriete.nbMaison === 5) ? 'hotel' : 'maison')}"></select>`);
                select.data("propriete", propriete);
                select.data("group", group);
                for (let j = 0; j <= ((GestionTerrains.banqueroute) ? propriete.nbMaison : 5); j++) {
                    select.append("<option class=\"" + ((j === 5) ? "hotel" : "maison") + "\" value=\"" + j + "\" " + ((propriete.nbMaison === j) ? "selected" : "") + ">x " + ((j === 5) ? 1 : j) + "</option>");
                }
                select.change( (e) =>{
                    let target = $(e.currentTarget);
                    let prop = target.data("propriete");
                    // On verifie changement par rapport a l'origine
                    let value = parseInt(target.val());
                    if (prop.nbMaison === value) {
                        delete this.table[prop.id];
                        $('~span', target).text("");
                        GestionTerrains.update();
                        return;
                    }
                    let data = (value === 5) ? {
                        hotel: 1
                    } : {
                        maison: value - prop.nbMaison
                    };
                    data.propriete = prop;
                    data.nbMaison = value;
                    data.cout = (value > prop.nbMaison) ? (value - prop.nbMaison) * prop.prixMaison : (value - prop.nbMaison) * prop.prixMaison / 2;
                    target.removeClass().addClass((value === 5) ? 'hotel' : 'maison');
                    $('~span', target).text(data.cout);
                    this.table[prop.id] = data;
                    GestionTerrains.update();

                    // Si le groupe est vide, on permet l'hypotheque des terrains
                    let nbMaisons = 0;
                    const gr = target.data("group");
                    GestionTerrains.Constructions.div.find(`select[data-color="${prop.color}"]`).each(function () {
                        nbMaisons += value;
                    });
                    if (nbMaisons === 0) {
                        // Le groupe est hypothecable
                        GestionTerrains.Hypotheque.addGroup(gr);
                    }
                });
                divTerrain.append(select).append(`<span></span> ${CURRENCY}`);
                $(this.div).append(divTerrain);
            }
        },
        load: function () {
            let groups = GestionJoueur.getJoueurCourant().maisons.findConstructiblesGroupes();
            for (let color in groups) {
                let divTitre = $(`<div style="cursor:pointer" class="group-${color.substring(1)}">Groupe <span style="color:${color};font-weight:bold">${groups[color].proprietes[0].groupe.nom}'</span></div>`);
                divTitre.data("color", color.substring(1));
                divTitre.click(function () {
                    let id = 'div.propriete-' + $(this).data('color');
                    if ($(`${id}:visible`, this.div).length === 0) {
                        $(id, this.div).slideDown(); // On ouvre
                    } else {
                        $(id, this.div).slideUp();
                    }
                });
                this.div.append(divTitre);
                this._displayProprietesOfGroup(groups[color]);
            }
        }
    }
};

export {GestionTerrains};