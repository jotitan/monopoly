import {CURRENCY, DEBUG} from "../core/monopoly.js";
import {wrapDialog} from "./displayers.js";
import {bus} from "../bus_message.js";

/* Gere les affichages (message dialog, trace de log) */

/* Intercepte les evenements et affiche une information */
let MessageDisplayer = {
    div: null,
    order: 0,
    init: function (id) {
        if (this.div == null) {
            // Not init already, create div and bind events
            this.div = $('#' + id);
            this.bindEvents();
        }
        this.div.empty();
    },
    write: function (joueur, message) {
        MessageDisplayer.order++;
        let orderMessage = (DEBUG) ? (' (' + MessageDisplayer.order + ')') : '';
        this.div.prepend('<div><span style="color:' + joueur.color + '">' + joueur.nom + '</span> : ' + message + orderMessage + '</div>');
    },
    _buildProposition: function (proposition) {
        if (proposition == null) {
            return "";
        }
        let message = "";
        if (proposition.terrains != null && proposition.terrains.length > 0) {
            message = proposition.terrains.reduce((str, terrain) => this.events._buildTerrain(terrain) + ", " + str, "");
        }
        if (proposition.compensation > 0) {
            message += " compensation : " + proposition.compensation + " " + CURRENCY;
        }
        return message;
    },
    events: {
        write(player, message) {
            MessageDisplayer.write(player, message);
        },
        _buildTerrain: function (terrain) {
            return terrain == null ? '' : `<span style="font-weight:bold;color:${terrain.color}">${terrain.nom}</span>`;
        },
        people(nom, color = 'black') {
            return {color: color, nom: nom};
        },
        save(event) {
            this.write(this.people('info', 'green'), `sauvegarde de la partie (${event.name})`);
        },
        depart(event) {
            this.write(event.joueur, `s\'arrête sur la case départ et gagne ${event.montant} ${CURRENCY}`);
        },
        initEnchere(event) {
            this.write(event.joueur != null ? event.joueur : this.people('La banque'), `met aux enchères  ${this._buildTerrain(event.maison)}`);
        },
        failEnchere(event) {
            this.write(this.people('Commissaire priseur', 'red'), `le terrain ${this._buildTerrain(event.maison)} n\'a pas trouvé preneur`);
        },
        successEnchere(event) {
            this.write(event.joueur, `achète aux enchères le terrain ${this._buildTerrain(event.maison)} pour ${CURRENCY} ${event.montant}`);
        },
        message(event) {

        },
        caisseCommunaute(event) {
            this.write(event.joueur, `carte caisse de communauté : ${event.message}`);
        },
        chance(event) {
            this.write(event.joueur, `carte chance : ${event.message}`);
        },
        achete(event) {
            this.write(event.joueur, `achète ${this._buildTerrain(event.maison)}`);
        },
        home(event) {
            this.write(event.joueur, `tombe sur ${this._buildTerrain(event.maison)} . Il est chez lui.`);
        },
        visite(event) {
            this.write(event.joueur, `tombe sur ${this._buildTerrain(event.maison)}`);
        },
        vend(event) {
            this.write(event.joueur, `vends ${event.nbMaison} maison(s)</span>`);
        },
        exit(event) {
            this.write(event.joueur, `s'est déconnecté</span>`);
        },
        loyer(event) {
            let mais = event.maison;
            let m = `<span style="font-weight:bold;color:${mais.color}"> ${mais.nom}</span>`;
            let jp = `<span style="color:${mais.joueurPossede.color}">${mais.joueurPossede.nom}</span>`;
            this.write(event.joueur, `tombe sur ${m} et paye ${mais.getLoyer()} ${CURRENCY} à ${jp}`);
        },
        start() {
            this.write(this.people('Monopoly'), 'La partie peut commencer');
        },
        player(event) {
            if (event.joueur.type === 'Distant') {
                this.write(this.people('Monopoly'), 'un siège est disponible');
            } else {
                this.write(event.joueur, "rentre dans la partie");
            }
        },
        hypotheque(event) {
            this.write(event.joueur, `hypothèque ${this._buildTerrain(event.maison)}`);
        },
        leveHypotheque(event) {
            this.write(event.joueur, `lève l'hypothèque de ${this._buildTerrain(event.maison)}`);
        },
        prison(event) {
            this.write(event.joueur, "va en prison");
        },
        lanceDes(event) {
            let message = `lance les dés et fait ${event.total} (${event.combinaison})`;
            if (event.prison != null) {
                if (event.prison.sortie === true) {
                    message += " et sort de prison";
                    if (event.prison.montant > 0) {
                        message += ` en payant ${CURRENCY} ${event.prison.montant}`;
                    }
                } else {
                    message += " et reste en prison";
                }
            }
            if (event.double != null) {
                if (event.double.triple === true) {
                    message += ", a fait 3 doubles et va en prison";
                }
                if (event.double.replay === true) {
                    message += " et rejoue";
                }
            }
            this.write(event.joueur, message);
        },
        desBus(event) {
            this.write(event.joueur, ` prend le bus et fait ${event.total}`);
        },
        desMrMonopoly(event) {
            this.write(event.joueur, ` fait un Mr Monopoly et va sur ${this._buildTerrain(event.maison)}`);
        },
        desTriple(event) {
            this.write(event.joueur, ` fait un triple et choisi d'aller à ${this._buildTerrain(event.maison)}`);
        },
        sortiePrison(event) {
            let message = "sort de prison";
            if (event.paye === true) {
                message += " en payant";
            }
            if (event.carte === true) {
                message += " en utilisant une carte sortie de prison"
            }
            if (!event.paye && !event.carte) {
                message += " en faisant un double"
            }
            this.write(event.joueur, message);
        },
        construit(event) {
            let message = "";
            let achats = event.achats;
            if (achats.maison > 0) {
                message += `achète ${achats.maison} maison(s) `;
            } else {
                if (achats.maison < 0) {
                    message += `vend ${(achats.maison * -1)} + " maison(s) `;
                }
            }
            if (achats.hotel > 0) {
                message += ((message !== "") ? " et " : "") + `achète ${achats.hotel}  hôtel(s) `;
            } else {
                if (achats.hotel < 0) {
                    message += ((message !== "") ? " et " : "") + `vend ${(achats.hotel * -1)} hôtel(s) `;
                }
            }
            // On affiche la liste des terrains
            if (achats.terrains != null && achats.terrains.size() > 0) {
                message += " sur ";
                for (let id in achats.terrains) {
                    message += this._buildTerrain(achats.terrains[id]) + ", ";
                }
            }
            if (message !== "") {
                this.write(event.joueur, message);
            }
        },
        initEchange(event) {
            let message = `souhaite obtenir ${this._buildTerrain(event.maison)} auprès de ${event.maison.joueurPossede.nom}`;
            this.write(event.joueur, message);
        },
        proposeEchange(event) {
            this.write(event.joueur, `propose : ${MessageDisplayer._buildProposition(event.proposition)}`);
        },
        accepteEchange(event) {
            this.write(event.joueur, 'accepte la proposition');
        },
        rejetteEchange(event) {
            this.write(event.joueur, 'rejete la proposition');
        },
        contreEchange(event) {
            this.write(event.joueur, `fait une contre-proposition ${MessageDisplayer._buildProposition(event.proposition)}`);
        },
        defaite(event) {
            this.write(event.joueur, 'a perdu et quitte la partie');
        },
        victoire(event) {
            this.write(event.joueur, 'a gagné la partie');
        },
        waitPlayers(event) {
            this.write(this.people('Monopoly'), `Partie n°${event.idGame} créée, en attente de ${event.nb} joueur(s)...`);
        },
        debug(event) {
            if (DEBUG) {
                this.write(this.people('debug', 'red'), event.message);
            }
        }
    },
    bindEvents: function () {
        bus.observe("monopoly.save", data => this.events.save(data));
        bus.observe("monopoly.start", () => this.events.start())
        bus.observe("monopoly.depart", data => this.events.depart(data))
        bus.observe("monopoly.exit", data => this.events.exit(data))
        bus.observe("monopoly.enchere.init", data => this.events.initEnchere(data))
        bus.observe("monopoly.enchere.fail", data => this.events.failEnchere(data))
        bus.observe("monopoly.enchere.success", data => this.events.successEnchere(data))
        bus.observe("monopoly.caissecommunaute.message", data => this.events.caisseCommunaute(data))
        bus.observe("monopoly.chance.message", data => this.events.chance(data))
        bus.observe("monopoly.acheteMaison", data => this.events.achete(data))
        bus.observe("monopoly.chezsoi", data => this.events.home(data))
        bus.observe("monopoly.visiteMaison", data => this.events.visite(data))
        bus.observe("monopoly.vendMaison", data => this.events.vend(data))
        bus.observe("monopoly.payerLoyer", data => this.events.loyer(data))
        bus.observe("monopoly.newPlayer", data => this.events.player(data))
        bus.observe("monopoly.hypothequeMaison", data => this.events.hypotheque(data))
        bus.observe("monopoly.leveHypothequeMaison", data => this.events.leveHypotheque(data))
        bus.observe("monopoly.goPrison", data => this.events.prison(data))
        bus.observe("monopoly.derapide.bus", data => this.events.desBus(data))
        bus.observe("monopoly.derapide.triple", data => this.events.desTriple(data))
        bus.observe("monopoly.derapide.mrmonopoly", data => this.events.desMrMonopoly(data))
        bus.observe("monopoly.exitPrison", data => this.events.sortiePrison(data))
        bus.observe("monopoly.acheteConstructions", data => this.events.construit(data))
        bus.observe("monopoly.echange.init", data => this.events.initEchange(data))
        bus.observe("monopoly.echange.propose", data => this.events.proposeEchange(data))
        bus.observe("monopoly.echange.accept", data => this.events.accepteEchange(data))
        bus.observe("monopoly.echange.reject", data => this.events.rejetteEchange(data))
        bus.observe("monopoly.echange.contrepropose", data => this.events.contreEchange(data))
        bus.observe("monopoly.defaite", data => this.events.defaite(data))
        bus.observe("monopoly.victoire", data => this.events.victoire(data))
        bus.observe("monopoly.waitingPlayers", data => this.events.waitPlayers(data))
        bus.observe("monopoly.debug", data => this.events.debug(data));
        /*$
            .bind("monopoly.start", () => this.events.start())
            .bind("monopoly.save", (e, data) =>this.events.save(data))
            .bind("monopoly.depart", (e, data) => this.events.depart(data))
            .bind("monopoly.exit", (e, data) => this.events.exit(data))
            .bind("monopoly.enchere.init", (e, data) => this.events.initEnchere(data))
            .bind("monopoly.enchere.fail", (e, data) => this.events.failEnchere(data))
            .bind("monopoly.enchere.success", (e, data) => this.events.successEnchere(data))
            .bind("monopoly.caissecommunaute.message", (e, data) => this.events.caisseCommunaute(data))
            .bind("monopoly.chance.message", (e, data) => this.events.chance(data))
            .bind("monopoly.acheteMaison", (e, data) => this.events.achete(data))
            .bind("monopoly.chezsoi", (e, data) => this.events.home(data))
            .bind("monopoly.visiteMaison", (e, data) => this.events.visite(data))
            .bind("monopoly.vendMaison", (e, data) => this.events.vend(data))
            .bind("monopoly.payerLoyer", (e, data) => this.events.loyer(data))
            .bind("monopoly.newPlayer", (e, data) => this.events.player(data))
            .bind("monopoly.hypothequeMaison", (e, data) => this.events.hypotheque(data))
            .bind("monopoly.leveHypothequeMaison", (e, data) => this.events.leveHypotheque(data))
            .bind("monopoly.goPrison", (e, data) => this.events.prison(data))
            .bind("monopoly.derapide.bus", (e, data) => this.events.desBus(data))
            .bind("monopoly.derapide.triple", (e, data) => this.events.desTriple(data))
            .bind("monopoly.derapide.mrmonopoly", (e, data) => this.events.desMrMonopoly(data))
            .bind("monopoly.exitPrison", (e, data) => this.events.sortiePrison(data))
            .bind("monopoly.acheteConstructions", (e, data) => this.events.construit(data))
            .bind("monopoly.echange.init", (e, data) => this.events.initEchange(data))
            .bind("monopoly.echange.propose", (e, data) => this.events.proposeEchange(data))
            .bind("monopoly.echange.accept", (e, data) => this.events.accepteEchange(data))
            .bind("monopoly.echange.reject", (e, data) => this.events.rejetteEchange(data))
            .bind("monopoly.echange.contrepropose", (e, data) => this.events.contreEchange(data))
            .bind("monopoly.defaite", (e, data) => this.events.defaite(data))
            .bind("monopoly.victoire", (e, data) => this.events.victoire(data))
            .bind("monopoly.waitingPlayers", (e, data) => this.events.waitPlayers(data))
            .bind("monopoly.debug", (e, data) => this.events.debug(data));*/
    }
}

/* Affichage des informations dans une boite de dialogue */
let InfoMessage = {
    div: null,
    init: function (id) {
        this.div = $('#' + id);
    },
    _initMessage: function (color, titre, message) {
        bus.debug({
            message: message
        });
        this.div.prev().css("background-color", color);
        this.div.dialog('option', 'title', titre);
        this.div.empty();
        this.div.append(message);
    },
    /* Affiche uniquement pour un vrai joueur */
    createGeneric: function (joueur, titre, background, message, actionButtons) {
        this._initMessage(background, titre, message);

        // Empeche la fermeture sans vraie action
        this.div.unbind('dialogclose.message').bind('dialogclose.message', function () {
            InfoMessage.div.dialog('open');
        });
        let buttons = {};
        actionButtons.forEach(function (action) {
            buttons[action.title] = function () {
                InfoMessage.div.unbind('dialogclose.message');
                InfoMessage.div.dialog('close');
                action.fct();
            }
        });
        this.div.dialog('option', 'buttons', buttons);

        if (joueur.canPlay || forceshow) {
            wrapDialog(this.div, 'open');
        }
        return buttons;
    },
    /* @params buttons : additonal buttons */
    create: function (joueur, titre, background, message, call = () => {
    }, param, forceshow, buttons) {
        this._initMessage(background, titre, message);
        let button = {
            "Ok": function () {
                InfoMessage.close(() => call(param));
            }
        };
        if (buttons != null) {
            for (let title in buttons) {
                button[title] = buttons[title];
            }
        }
        /*this.div.unbind('dialogclose.message').bind('dialogclose.message', function () {
            InfoMessage.div.unbind('dialogclose.message');
            if (call != null) {
                call(param);
            }

        });*/
        if (call != null) {
            this.div.dialog('option', 'buttons', button);
        }
        /* On affiche pas le panneau si le timeout est à 0 (partie rapide) */
        if (joueur.canPlay || forceshow) {
            wrapDialog(this.div, 'open');
        }
        return button;
    },
    close: function (callback = () => {
    }) {
        if (this.div.dialog('isOpen')) {
            this.div.dialog('close');
        }
        callback();
    },
    createPrison: function (montantPrison, joueur, nbTours, callback) {
        this._initMessage("red", "Vous êtes en prison depuis " + nbTours + " tours.", "Vous êtes en prison, que voulez vous faire");

        let buttons = {
            "Payer": function () {
                joueur.payer(montantPrison);
                // TODO : Ajouter message pour indiquer qu'il paye
                joueur.exitPrison({paye: true, notify: true});
                InfoMessage.close(callback);
            },
            "Attendre": function () {
                InfoMessage.close(callback);
            }
        }
        if (joueur.cartesSortiePrison.length > 0) {
            buttons["Utiliser carte"] = function () {
                joueur.utiliseCarteSortiePrison();
                // TODO : ajouter message pour dire qu'il utilise une carte
                joueur.exitPrison({carte: true, notify: true});
                InfoMessage.close(callback);
            }
        }
        this.div.dialog('option', 'buttons', buttons);
        /*this.div.bind('dialogclose.prison', function () {
            console.log("BIND CLOSE DIALOG, launch callback")
            InfoMessage.div.unbind('dialogclose.prison');
            callback();
        });*/
        if (joueur.canPlay) {
            wrapDialog(this.div, 'open');
        }
        return buttons;
    }
}

export {InfoMessage, MessageDisplayer};
