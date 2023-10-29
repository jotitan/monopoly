import {CommunicationDisplayer, dialog} from '../display/displayers.js'
import {GestionJoueur} from "./gestion_joueurs.js";
import {GestionFiche} from "../display/case_jeu.js";
import {CURRENCY} from "./monopoly.js";
import {bus} from "../bus_message.js";

/* Gestion des encheres et des echanges entre joueurs */

/* Gestion d'une mise aux enchere d'un terrain */
/* Empecher un joueur d'acquerir un terrain ? */
let GestionEnchere = {
    terrain: null,
    callback: null,
    miseDepart: 0,
    ventePerte: false,
    pasVente: 2000,
    joueurLastEnchere: null,
    lastEnchere: 0,
    nextMontantEnchere: 0,
    currentJeton: 0,
    joueursExit: [],
    endAckJoueurs: [], // Liste des joueurs ayant accuse de la fin des encheres
    transaction: 0, // Permet d'authentifier la transaction

    setPasVente(pas) {
        this.pasVente = pas;
    },

    /* Initialise une mise aux enchere */
    /* @param miseDepart : prix de depart */
    /* @param ventePerte : si vrai, permet de baisser la mise de depart (cas d'une vente obligee pour payer une dette) */
    init: function (terrain, miseDepart, ventePerte, callback) {
        this.terrain = terrain;
        this.callback = callback;
        this.miseDepart = miseDepart;
        this.lastEnchere = 0;
        this.endAckJoueurs = [];
        this.nextMontantEnchere = miseDepart;
        this.ventePerte = ventePerte;
        this.joueurLastEnchere = null;
        this.currentJeton = 0;
        this.joueursExit = [];
        this.transaction++;
        bus.send('monopoly.enchere.init', {
            maison: this.terrain,
            joueur: this.terrain.joueurPossede
        });

        GestionJoueur.forEach(j => j.initEnchere(this.transaction, this.terrain, this.miseDepart));
        this.runEnchere();
    },
    computeEncherisseurs: function () {
        let encherisseurs = [];
        let observers = [];
        // exclure les joueurs qui ont perdus
        GestionJoueur.forEach(j => {
            if (!j.equals(this.terrain.joueurPossede) && !j.equals(this.joueurLastEnchere) && this.joueursExit[j.nom] == null && j.defaite === false) {
                encherisseurs.push(j);
            } else {
                observers.push(j);
            }
        });
        return {
            encherisseurs: encherisseurs,
            observers: observers
        };
    },
    /* On lance aux joueurs les encheres, le premier qui repond prend la main, on relance a chaque fois (et on invalide le resultat des autres) */
    /* @param newEnchere : quand l'enchere, on notifie les joueurs (ca peut les interesse) */
    runEnchere: function (newEnchere = false) {
        let joueurs = this.computeEncherisseurs();
        for (let i = 0; i < joueurs.encherisseurs.length; i++) {
            joueurs.encherisseurs[i].updateEnchere(this.transaction, this.currentJeton, this.nextMontantEnchere, this.joueurLastEnchere, newEnchere);
        }
        for (let i = 0; i < joueurs.observers.length; i++) {
            joueurs.observers[i].updateInfoEnchere(this.nextMontantEnchere, this.joueurLastEnchere);
        }
    },
    /* Appele par un joueur  */
    exitEnchere: function (joueur) {
        if (this.joueursExit[joueur.nom] != null) {
            return;
        }
        this.joueursExit[joueur.nom] = joueur;
        GestionJoueur.forEach(function (j) {
            j.notifyExitEnchere(joueur)
        });
        if (this.checkEndEnchere()) {
            this.manageEndEnchere();
        }
    },
    /* Verifie si l'enchere est terminee */
    checkEndEnchere: function () {
        // 1) Vente par banque, pas d'enchere
        // 2) Vente par joueur, pas d'enchere ou vente par banque avec une enchere
        // 3) Vente par joueur avec enchere
        return (this.joueursExit.size() >= GestionJoueur.getNb() ||
            (this.joueursExit.size() >= GestionJoueur.getNb() - 1 && (this.terrain.joueurPossede != null || this.joueurLastEnchere != null)) ||
            (this.joueursExit.size() >= GestionJoueur.getNb() - 2 && this.joueurLastEnchere != null && this.terrain.joueurPossede != null)
        );
    },
    /* Methode appelee par un joueur pour valider une enchere, le premier invalide les autres */
    doEnchere: function (joueur, montant, jeton) {
        if (jeton < this.currentJeton) {
            // Demande non prise en compte
            throw "Trop lent, une enchere a deja ete faite";
        }
        // On empeche un meme joueur d'encherir sur son offre
        if (joueur.equals(this.joueurLastEnchere)) {
            return;
        }
        this.currentJeton++;
        this.joueurLastEnchere = joueur;
        this.lastEnchere = montant;
        this.nextMontantEnchere = this.lastEnchere + this.pasVente;
        // Si c'est le dernier joueur qui fait une enchere, on doit arreter le joueur
        if (this.checkEndEnchere()) {
            this.manageEndEnchere();
        } else {
            this.runEnchere();
        }
    },
    checkEnchere: function (jeton) {
        if (jeton >= this.currentJeton) {
            // Pas d'enchere, la derniere est la bonne
            this.manageEndEnchere();
        } else {
            // Rien, gestion autonome
        }
    },
    manageEndEnchere: function () {
        if (this.joueurLastEnchere == null) {
            // On relance les encheres en diminuant la mise de depart
            if (this.ventePerte && (this.nextMontantEnchere - this.pasVente) > this.miseDepart / 2) {
                this.nextMontantEnchere -= this.pasVente;
                // On force les joueurs a reparticiper (le nouveau tarif peut interesser)
                this.joueursExit = [];
                this.runEnchere(true);
            } else {
                //pas de vente
                bus.send('monopoly.enchere.fail', {
                    maison: this.terrain
                });
                this.endEnchere();
            }

        } else {
            // La mise aux encheres est terminee, on procede a l'echange
            // Correspond a un terrain
            if (this.terrain.joueurPossede == null) {
                this.joueurLastEnchere.acheteMaison(this.terrain, this.lastEnchere);
            } else {
                this.joueurLastEnchere.payerTo(this.lastEnchere, this.terrain.joueurPossede);
                this.joueurLastEnchere.getSwapProperiete(this.terrain);
            }

            bus.send('monopoly.enchere.success', {
                joueur: this.joueurLastEnchere,
                maison: this.terrain,
                montant: this.lastEnchere
            });

            this.endEnchere();
        }
    },
    endEnchere: function () {
        this.terrain = null;
        // On notifie les joueurs que c'est termine
        GestionJoueur.forEach(j => j.endEnchere(this.lastEnchere, this.joueurLastEnchere));
    },
    /* Enregistre les joueurs qui accusent reception. Quand tous ont repondu, on lance le callback */
    checkEndNotify: function (joueur) {
        this.endAckJoueurs[joueur.numero] = true;
        if (this.endAckJoueurs.size() >= GestionJoueur.getNb()) {
            this.doCallback();
        }
    },
    doCallback: function () {
        if (this.callback) {
            this.callback();
        }
    }
};

let GestionEnchereDisplayer = {
    panel: null,
    currentMontant: 0,
    currentEncherisseur: null,
    terrain: null,
    displayer: null, // Joueur qui affiche le panneau
    init: function (id) {
        this.panel = document.getElementById(id);
    },
    display: function (terrain, joueur) {
        this.terrain = terrain;
        this.displayer = joueur;
        this.panel.querySelector('.proprietaire').innerHTML = terrain.joueurPossede != null ? terrain.joueurPossede.nom : 'Banque';
        this.panel.querySelector('.terrain').innerHTML = terrain.nom;
        this.panel.querySelector('.terrain').style.setProperty('color', terrain.color);
        this.panel.querySelector('.list_exit').innerHTML = '';
        this.panel.querySelector('.list_encherisseurs').innerHTML = '';
        this.panel.querySelector('.messages').innerHTML = '';
        dialog.close();
        dialog.open(this.panel, {title: 'Mise au enchère',width:360,height:267})
    },
    /* Affiche l'option pour fermer le panneau */
    displayCloseOption: function (montant, joueur) {
        if (joueur != null) {
            // On affiche la victoire du joueur (derniere enchere faite)
            this.panel.querySelector('.montant').innerHTML = montant;
            this.panel.querySelector('.montant').style.setProperty('color', 'green');
            this.panel.querySelector('.last_encherisseur').innerHTML = joueur.nom;

            if (joueur.equals(this.displayer)) {
                // Message pour le joueur qui a remporte
                this.panel.querySelector('.messages').append(document.createTextNode("Vous avez remporté l'enchère"));
            } else {
                this.panel.querySelector('.messages').append(document.createTextNode(`${joueur.nom} a remporté l'enchère`));
            }
        } else {
            this.panel.querySelector('.montant').style.setProperty('color', 'red');
        }
        dialog.updateButtons({'Fermer': () => GestionEnchereDisplayer.close()});
    },
    /* Nettoie l'affichage */
    clean: function () {
        this.panel.querySelector('.list_exit').innerHTML = '';
    },
    /* Affiche le depart d'un joueur des encheres */
    showJoueurExit: function (joueur) {
        this.panel.querySelector('.list_exit').insertAdjacentHTML('beforeend', `<div>${joueur.nom} est sorti</div>`);
    },
    exitEnchere: function () {
        dialog.clearButtons();
    },
    close: function () {
        GestionEnchere.doCallback();
        dialog.close()
    },
    /* Si canDoEnchere est vrai, le contexte doit etre present */
    updateInfo: function (montant, encherisseur, canDoEnchere, contexte) {
        if (canDoEnchere && contexte == null) {
            throw "Impossible de gerer l'enchere";
        }
        if (this.currentMontant != null && this.currentEncherisseur != null) {
            this.panel.querySelector('.list_encherisseurs').insertAdjacentHTML('afterbegin', `<p> ${CURRENCY}  ${this.currentMontant} : ${this.currentEncherisseur.nom}</p>`);
            this.panel.querySelectorAll('.list_encherisseurs > p').forEach((n, pos) => {
                if (pos > 3) {
                    n.remove();
                }
            })
        }
        this.currentMontant = montant;
        this.currentEncherisseur = encherisseur;

        this.panel.querySelector('.montant').innerHTML = montant;
        if (encherisseur != null) {
            this.panel.querySelector('.last_encherisseur').innerHTML = encherisseur.nom;
        }
        if (canDoEnchere) {
           let buttons = {
                'Encherir': () => GestionEnchere.doEnchere(GestionEnchereDisplayer.displayer, montant, contexte.jeton),
                'Quitter': () => GestionEnchere.exitEnchere(GestionEnchereDisplayer.displayer)
            };
            dialog.updateButtons(buttons);
        } else {
            dialog.clearButtons();
        }
    }
}

/* Panneau d'echange */
const EchangeDisplayer = {
    joueur: null,
    init: function (id, idSelectJoueurs, idListTerrainsJoueur, idListTerrainsAdversaire) {
        this.panel = document.getElementById(id);
        this.selectJoueurs = document.getElementById(idSelectJoueurs);
        this.listTerrainsJoueur = document.getElementById(idListTerrainsJoueur);
        this.listTerrainsAdversaire = document.getElementById(idListTerrainsAdversaire);

        // On charge les joueurs
        GestionJoueur.forEach(j => this.selectJoueurs.insertAdjacentHTML('beforeend', `<option value="${j.id}">${j.nom}</option>`))
        this.selectJoueurs.onchange = d => {
            this.listTerrainsAdversaire.querySelectorAll('optgroup').forEach(d => d.remove())
            const joueur = GestionJoueur.getById(d.currentTarget.value);
            if (joueur != null) {
                Object.values(joueur.maisons.getMaisonsGrouped()).forEach(group => {
                    let optionGroup = document.createElement('optgroup');
                    optionGroup.label = `Groupe ${group.groupe}`
                    optionGroup.style.setProperty('color', group.color);
                    group.terrains.forEach(fiche => optionGroup.insertAdjacentHTML('beforeend', `<option value="${fiche.id}">${fiche.nom}</option>`));
                    EchangeDisplayer.listTerrainsAdversaire.append(optionGroup);
                })
            }
        };
    },
    open: function (joueur) {
        this.joueur = joueur;
        // On cache le joueur qui a ouvert le panneau
        this.selectJoueurs.querySelectorAll('option').forEach(d => d.style.setProperty('display', ''));
        this.selectJoueurs.querySelector(`option[value="${joueur.id}"]`).style.setProperty('display', 'none');

        // Affichage des terrains du joueur
        this.listTerrainsJoueur.innerHTML = '';
        CommunicationDisplayer.showNativeTerrainByGroup(EchangeDisplayer.listTerrainsJoueur, joueur);
        const buttons = {
            "Annuler": () => EchangeDisplayer.close(),
            "Proposer": () => EchangeDisplayer.propose()
        }
        dialog.open(this.panel, {title: 'Echange de terrains', width: 400, height: 600, buttons: buttons})
    },
    propose: function () {
        let proprietaire = GestionJoueur.getById(EchangeDisplayer.selectJoueurs.value);
        let terrain = GestionFiche.getById(this.listTerrainsAdversaire.value);
        if (proprietaire == null || terrain == null) {
            return;
        }
        // L'action de fin, c'est la reprise du jeu par le joueur (donc rien)
        GestionEchange.init(this.joueur, proprietaire, terrain, null);
        // On recupere la proposition
        let proposition = {
            terrains: [],
            compensation: 0
        };
        this.listTerrainsJoueur.querySelectorAll('input:checked').forEach(t => proposition.terrains.push(GestionFiche.getById(t.value)));
        proposition.compensation = parseInt(document.getElementById('idArgentProposition').value) || 0;
        this.close();
        GestionEchange.propose(proposition);
    },
    close: function () {
        dialog.close();
        this.selectJoueurs.value = '';
    }
}

/* Gere l'echange d'une propriete entre deux joueurs */
let GestionEchange = {
    running: false,
    /* Indique qu'un echange est en cours, la partie est bloquee */
    demandeur: null,
    proprietaire: null,
    terrain: null,
    proposition: null,
    initialProposition: null,
    /* Derniere proposition faite. */
    endCallback: null,
    /* Methode appelee a la fin de la transaction */
    /* Initialise une transaction entre deux joueurs */
    init: function (demandeur, proprietaire, terrain, endCallback) {
        if (this.running) {
            throw "Transaction impossible, une transaction est deja en cours.";
        }
        this.running = true;
        this.demandeur = demandeur;
        this.proprietaire = proprietaire;
        this.terrain = terrain;
        this.endCallback = endCallback;
        bus.send('monopoly.echange.init', {
            joueur: demandeur,
            maison: terrain
        });
    },
    /* Termine la transaction entre deux personnes */
    end: function () {
        this.running = false;
        this.demandeur = null;
        this.proprietaire = null;
        this.terrain = null;
        if (this.endCallback != null) {
            this.endCallback();
        }
        this.endCallback = null;
    },
    /* Fait une proposition au proprietaire */
    /* Une proposition peut etre un ou plusieurs terrains ou de l'argent. */
    propose: function (proposition) {
        // On transmet la demande au proprietaire
        this.proposition = proposition;
        this.initialProposition = proposition;
        bus.send('monopoly.echange.propose', {
            joueur: GestionEchange.demandeur,
            proposition: proposition
        });
        this.proprietaire.traiteRequeteEchange(this.demandeur, this.terrain, proposition);
    },
    /* Contre proposition du proprietaire, ca peut être des terrains ou de l'argent */
    contrePropose: function (proposition, joueurContre) {
        bus.send('monopoly.echange.contrepropose', {
            joueur: this.proprietaire,
            proposition: proposition
        });
        this.proposition = proposition;
        if (joueurContre.equals(this.demandeur)) {
            this.proprietaire.traiteContreProposition(proposition, joueurContre, this.terrain);
        } else {
            this.demandeur.traiteContreProposition(proposition, joueurContre, this.terrain);
        }
    },
    abort: function () {
        this.end();
    },
    /* Le proprietaire accepte la proposition. On prend la derniere proposition et on l'applique */
    /* @param joueurAccept : joueur qui accepte la proposition (suite au aller retour) */
    accept: function (joueurAccept) {
        bus.send('monopoly.echange.accept', {
            joueur: joueurAccept
        });
        // On notifie a l'autre joueur que c'est accepte
        if (joueurAccept.equals(this.demandeur)) {
            this.proprietaire.notifyAcceptProposition(function () {
                GestionEchange._doAccept();
            });
        } else {
            this.demandeur.notifyAcceptProposition(function () {
                GestionEchange._doAccept();
            });
        }
    },
    _doAccept: function () {
        // La propriete change de proprietaire
        this.demandeur.getSwapProperiete(this.terrain);
        // Le proprietaire recoit la proposition
        if (this.proposition.compensation != null) {
            this.demandeur.payerTo(this.proposition.compensation, this.proprietaire);
        }
        if (this.proposition.terrains != null && this.proposition.terrains.length > 0) {
            for (const t in this.proposition.terrains) {
                this.proprietaire.getSwapProperiete(this.proposition.terrains[t]);
            }
        }
        this.end();
    },
    reject: function (joueurReject) {
        bus.send('monopoly.echange.reject', {
            joueur: joueurReject
        });
        // On notifie le joueur et on lui donne le callback(end) pour lancer la suite du traitement
        // Cas de la contreproposition
        if (joueurReject.equals(this.demandeur)) {
            this.proprietaire.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.initialProposition);
        } else {
            this.demandeur.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.proposition);
        }
    }
}

export {GestionEnchere, GestionEnchereDisplayer, EchangeDisplayer, GestionEchange};