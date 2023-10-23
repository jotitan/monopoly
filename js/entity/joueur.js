import {ETAT_ACHETE, ETAT_LIBRE, GestionFiche} from "../display/case_jeu.js";
import {Pion} from "./pion.js";
import {GestionDes} from "./dices.js";
import {doActions, globalStats, VARIANTES} from "../core/monopoly.js";
import {GestionJoueur} from "../core/gestion_joueurs.js";
import {CommunicationDisplayer, FicheDisplayer} from "../display/displayers.js";
import {infoMessage} from "../display/message.js";
import {GestionTerrains} from "../core/gestion_terrains.js";
import {GestionEnchere, GestionEnchereDisplayer} from "../core/enchere.js";
import {bus} from "../bus_message.js";
import {deepCopy} from "../utils.js";

// Represente houses of a player
class Maisons {
    constructor(joueur, maisons = []) {
        this.joueur = joueur;
        this.maisons = [];
        maisons.forEach(m => this.add(m));
    }

    add(maison) {
        maison.joueurPossede = this.joueur;
        maison.statut = ETAT_ACHETE;
        this.maisons.push(maison);
    }

    remove(maison) {
        let index = this.maisons.findIndex(m => m.equals(maison));
        if (index !== -1) {
            maison.statut = ETAT_LIBRE;
            maison.joueurPossede = null;
            this.maisons.splice(index, 1);
        }
    }

    /**
     * Renvoie la liste des groupes presque complet (un terrain manquant) pour lequel le terrain est encore libre
     */
    getGroupesPossibles() {
        let groups = new Set();
        this.maisons
            .filter(m => !m.isGrouped())
            .filter(maison =>
                // calcule les terrains libre de la meme couleur : si 1 libre=>ok, si adversaire ou libre 1, ko
                maison.groupe.fiches
                    .filter(f => !this.joueur.equals(f.joueurPossede))
                    .reduce((libre, f) => libre + (f.statut === ETAT_LIBRE ? 1 : 10), 0)
                === 1
            ).forEach(m => groups.add(m.color));
        return Array.from(groups);
    }

    /** Renvoie les maisons du joueur par groupe avec des details*/
    getMaisonsGrouped() {
        const groups = [];
        this.maisons.forEach(maison => {
            if (maison.groupe == null) {
                if (groups["others"] === undefined) {
                    groups["others"] = {
                        groupe: 'Autres',
                        color: 'black',
                        terrains: [maison]
                    };
                } else {
                    groups["others"].terrains.push(maison);
                }
            } else {
                if (groups[maison.groupe.nom] === undefined) {
                    groups[maison.groupe.nom] = {
                        groupe: maison.groupe.nom,
                        color: maison.groupe.color,
                        terrains: [maison]
                    };
                } else {
                    groups[maison.groupe.nom].terrains.push(maison);
                }
            }
        });
        return groups;
    }

    /** Renvoie la liste des maisons regroupées par groupe. getMaisonsGrouped est plus complete */
    findMaisonsByGroup() {
        let groups = [];
        this.maisons.forEach(m => {
            if (groups[m.groupe.nom] == null) {
                groups[m.groupe.nom] = [];
            }
            groups[m.groupe.nom].push(m);
        });
        return groups;
    }

    /** Renvoie la liste des terrains hypothecables : sans construction sur le terrain et ceux de la famille, pas deja hypotheques */
    findMaisonsHypothecables() {
        return this.maisons
            .filter(propriete =>
                propriete.statutHypotheque === false
                && propriete.nbMaison === 0
                && !this.maisons.some(m => m.color === propriete.color && m.nbMaison > 0));
    }

    /** Renvoie la liste des maisons hypothequees */
    findMaisonsHypothequees() {
        return this.maisons.filter(m => m.statutHypotheque)
    }

    /** Renvoie la liste des groupes constructibles du joueur
     * @returns {Array}
     */
    findConstructiblesGroupes() {
        const colorsKO = [];
        const groups = [];
        this.maisons
            .filter(m => m.isTerrain() === true && m.groupe != null)
            .forEach(m => {
                if (colorsKO[m.color] === undefined) {
                    // On recherche si on a toutes les proprietes du groupe
                    let infos = m.groupe.getInfos(this.joueur);
                    // Possede le groupe
                    if (infos.free === 0 && infos.adversaire === 0 && infos.hypotheque === 0) {
                        groups[m.color] = {
                            color: m.color,
                            group: m.groupe,
                            proprietes: m.groupe.fiches
                        };
                    } else {
                        colorsKO[m.color] = true;
                    }
                }
            });
        return groups;
    }

    /* Cherche les terrains qui interesse chez les adversaires */
    /* Les terrains sont tries par interet.
     * Les criteres : la rentabilite, le nombre de terrain a acheter (1 ou 2), le fait de faire une ligne avec un groupe possede */
    /* @param joueur : ne recherche que les proprietes de ce joueur */

    /* @param excludes : terrain exclu, a ne pas renvoyer (celui vise par l'echange) */
    findOthersInterestProprietes(joueur, exclude, strategie) {
        let interests = [];
        let treatGroups = []; // groupes traites
        // On parcourt les terrains du joueur. Pour chaque, on etudie le groupe
        this.maisons.forEach(maison => {
            if (treatGroups[maison.groupe.color] === undefined) {
                // Structure : free,joueur,adversaire,nbAdversaires
                let infos = maison.groupe.getInfos(this.joueur);
                // Si tous les terrains vendus et un terrain a l'adversaire ou deux terrains a deux adversaires differents, on peut echanger
                if (infos.free === 0 && (infos.adversaire === 1 || infos.nbAdversaires > 1)) {
                    infos.maisons
                        .filter(m => (joueur === undefined || joueur.equals(m.joueurPossede)) && (exclude == null || !exclude.groupe.equals(m.groupe)))
                        .filter(() => !(exclude && maison.groupe.color === exclude.groupe.color))
                        // On ajoute chaque maison avec le nombre a acheter pour terminer le groupe
                        .forEach(m => interests.push({maison: m, nb: infos.maisons.length}));
                }
                treatGroups[maison.groupe.color] = true;
            }
        });

        let groups = this.findConstructiblesGroupes();

        // On trie la liste selon rapport (argent de 3 maison / achat terrain + 3 maisons), le nombre de terrains a acheter
        // on rajoute le fait que ca appartient a la strategie et que c'est constructible
        interests.sort((a, b) => this._computeScoreInterest(a, b, groups, strategie));
        return interests;

    }

    _computeScoreInterest(a, b, groups, strategie) {
        let critere1 = a.nb / b.nb;
        /* Second critere : rentabilite du terrain */
        let critere2 = a.maison.getRentabiliteBrute() / b.maison.getRentabiliteBrute();

        let voisinA = 1,
            voisinB = 1;

        for (let g in groups) {
            if (groups[g].group.isVoisin(a.maison.groupe)) {
                voisinA++;
            }
            if (groups[g].group.isVoisin(b.maison.groupe)) {
                voisinB++;
            }
        }
        let critere3 = voisinA / voisinB;
        /* Quatrieme critere : fait une ligne avec un autre groupe du joueur */
        let critere4 = 1;
        if (strategie != null) {
            let interetA = strategie.interetPropriete(a.maison);
            let interetB = strategie.interetPropriete(b.maison);
            if (interetA !== interetB) {
                critere4 = interetA ? 0.5 : 2;
            }
        }
        let critere5 = 1;
        if (a.maison.isTerrain() !== b.maison.isTerrain()) {
            critere5 = (a.maison.isTerrain()) ? 0.5 : 4;
        }
        return critere1 * critere2 * critere3 * critere4 * critere5 - 1;
    }

    /* Renvoie la liste des terrains peu important (gare, compagnie et terrains hypotheques) */

    /* On integre dans les resultats le nombre d'elements par groupe */
    findUnterestsProprietes() {
        const nbByGroups = [];
        let proprietes = this.maisons.filter(m => !m.isTerrain());
        proprietes.forEach(m => {
            if (nbByGroups[m.groupe.nom] === undefined) {
                nbByGroups[m.groupe.nom] = 1;
            } else {
                nbByGroups[m.groupe.nom]++;
            }
        });
        return {
            proprietes: proprietes,
            nbByGroups: nbByGroups
        };
    }

    /**
     * Renvoie les terrains constructibles qui n'interessent (pas en groupe)
     * @param interestTerrains : terrains qui interessent, on filtre
     */
    findOthersProperties(interestTerrains) {
        const mapInterests = [];
        for (let i in interestTerrains) {
            mapInterests[interestTerrains[i].maison.color] = 1;
        }
        return this.maisons.filter(m => m.isTerrain() && !m.isGrouped() && mapInterests[m.color] === undefined);
    }

    /** Renvoie les groupes constructibles avec les proprietes de chaque */
    findMaisonsConstructibles() {
        const mc = [];
        const colorsOK = [];
        const colorsKO = [];

        // Si une maison est hypothequee, on ne peut plus construire sur le groupe
        this.maisons
            .filter(m => m.isTerrain())
            .forEach(m => {
                if (colorsOK[m.color] === true) {
                    mc.push(m); // on a la couleur, on ajoute
                } else {
                    if (colorsKO[m.color] === undefined) {
                        // On recherche si on a toutes les couleurs et si une propriete qui n'appartient pas au joueur
                        let ok = !m.groupe.fiches.some(f => f.isTerrain() && (!this.joueur.equals(f.joueurPossede) || f.statutHypotheque === true));
                        if (!ok) {
                            colorsKO[m.color] = true;
                        } else {
                            colorsOK[m.color] = true;
                            mc[mc.length] = m;
                        }
                    }
                }
            });
        return mc;
    }

    libere() {
        this.maisons.forEach(m => m.libere());
        this.maisons = [];
    }

    // Cherche la position ou placer la nouvelle fiche (tri par couleur)
    cherchePlacement(maison) {
        const found = this.maisons.find(m=>m.color === maison.color);
        return found ? found.input : null;
    }
}

class PlayerSaver {
    constructor(joueur) {
        this.joueur = joueur;
    }

    save() {
        // On sauvegarde id, nom, color,montant, prison, bloque, defaite, cartes, son type (manuel). Pas besoin des maisons (auto)
        let data = {
            canPlay: this.joueur.canPlay,
            id: this.joueur.id,
            nom: this.joueur.nom,
            color: this.joueur.color,
            montant: this.joueur.montant,
            enPrison: this.joueur.enPrison,
            nbDouble: this.joueur.nbDouble,
            bloque: this.joueur.bloque,
            defaite: this.joueur.defaite,
            cartesPrison: this.joueur.cartesSortiePrison.length,
            position: this.joueur.pion.position,
            axe: this.joueur.pion.axe
        };
        this.saveMore(data);
        return data;
    }

    load(data) {
        for (let name in data) {
            if (this[name] != null) {
                this[name] = data[name];
            }
        }
        this.joueur.setArgent(data.montant);
        this.loadMore(data);
        // Position initiale, aucune action
        this.joueur.pion.goDirectToCell(data.axe, data.position);
        // Cas des cartes de prison

        // Cas ou le joueur est mort
        if (this.joueur.defaite) {
            const div = this.joueur.div.querySelector('.joueur-bloc');
            div.removeAttribute('style');
            div.classList.add('defaite');
        }
        return this.joueur;
    }

    /* Template Method : les enfants peuvent la reimplementer */

    // Indique les choses a sauvegarder en plus
    saveMore() {
    }

    loadMore(data) {
    }

}

/* Represente un joueur humain */
class Joueur {
    constructor(numero, nom = '', color, argent, montantDepart = 0) {
        this.numero = numero;
        this.type = "Local";
        this.id = numero;
        this.nom = nom;
        this.color = color;
        this.montant = argent;
        this.maisons = new Maisons(this);
        this.enPrison = false;
        this.pion = null;
        // Nombre de tour en prison
        this.nbDouble = 0;
        // Indique que le joueur est bloque. Il doit se debloquer pour que le jeu continue
        this.bloque = false;
        this.defaite = false;
        this.tourDefaite = null;
        this.cartesSortiePrison = []; // Cartes sortie de prison
        // Indique que c'est un vrai joueur, pas un robot
        this.canPlay = true;
        this.montantDepart = montantDepart;	// Montant sur la case depart
        this.enableMouseFunction = () => {
        };
        this.saver = new PlayerSaver(this);
    }

    setEnableMouseFunction(fct) {
        this.enableMouseFunction = fct;
    }

    equals(joueur) {
        return joueur != null && this.numero === joueur.numero;
    }

    // Renvoie vrai si la place de joueur est disponible
    isSlotFree() {
        return false;
    }

    // Utilise la carte sortie de prison
    utiliseCarteSortiePrison() {
        if (this.cartesSortiePrison.length === 0) {
            throw "Impossible d'utiliser cette carte";
        }
        this.cartesSortiePrison[this.cartesSortiePrison.length - 1].joueurPossede = null;
        this.cartesSortiePrison.splice(this.cartesSortiePrison.length - 1, 1);
    }

    /* Renvoie les stats et infos du jour :
     * Nombre de tour, nombre de fois en prison
     * Nombre de terrains, nombre de maison et hotel
     * Argent disponible, argent apres vente maison / hypotheque, argent apres hypotheque
     */
    getStats() {
        let statsJ = {
            type: this.type,
            prison: this.pion.stats.prison,
            tour: this.pion.stats.tour,
            argent: this.montant,
            argentDispo: this.montant,
            argentDispoHypo: this.montant,
            hotel: 0,
            maison: 0,
            strategie: this.strategie != null ? this.strategie.toString() : '-',
            comportement: this.comportement != null ? this.comportement.name : '-',
        };
        for (const index in this.maisons.maisons) {
            const maison = this.maisons.maisons[index];
            statsJ.hotel += maison.hotel === true ? 1 : 0;
            statsJ.maison += parseInt(maison.hotel === false ? maison.nbMaison : 0);
            // Revente des constructions + hypotheque
            statsJ.argentDispo += (maison.statutHypotheque) ? 0 : (((maison.isTerrain()) ? (maison.nbMaison * (maison.prixMaison / 2)) : 0) + maison.achat / 2);
            // Revente uniquement des terrains non groupes
            statsJ.argentDispoHypo += (!maison.isGrouped() && !maison.statutHypotheque) ? maison.achat / 2 : 0; // hypotheque des terrains non groupes
        }
        return statsJ;
    }

    /* Selectionne le joueur */
    select() {
        this.div.classList.add('joueurCourant');
        if (!this.enPrison) {
            this.nbDouble = 0;
        }
        this.joue();
    }

    // Notify to network, if necessary
    notifySelect() {
    }

    notifyDices(dices) {
    }

    // Lance les des
    lancerDes() {
        GestionDes.lancer();
    }

    getPosition() {
        return {
            pos: this.pion.position,
            axe: this.pion.axe
        };
    }

    /* Affiche la demande d'echange d'un joueur */
    traiteRequeteEchange(joueur, terrain, proposition) {
        // On affiche l'interface au joueur
        CommunicationDisplayer.show(joueur, this, terrain, proposition, this);
    }

    /* Affiche la contreproposition du joueur */
    traiteContreProposition(proposition) {
        CommunicationDisplayer.showContreProposition(proposition);
    }

    /* On affiche a l'utilisateur l'acceptation de la proposition */
    notifyAcceptProposition(callback) {
        // On affiche l'information
        CommunicationDisplayer.showAccept(callback);
    }

    /* On affiche a l'utilisateur le rejet de la proposition */
    notifyRejectProposition(callback) {
        CommunicationDisplayer.showReject(callback);
    }

    /* Initialise une mise aux encheres */

    /* @param transaction : numero de transaction pour communiquer */
    initEnchere(transaction, terrain) {
        GestionEnchereDisplayer.display(terrain, this);
    }

    /* Met a jour la derniere enchere qui a été faite (pour suivre l'avancement) quand le joueur ne participe plus */
    updateInfoEnchere(montant, lastEncherisseur) {
        GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, false);
    }

    /* Notifie lorsqu'un joueur quitte les encheres */
    notifyExitEnchere(joueur) {
        GestionEnchereDisplayer.showJoueurExit(joueur);
    }

    updateEnchere(transaction, jeton, montant, lastEncherisseur, isNewEnchere) {
        if (isNewEnchere) {
            GestionEnchereDisplayer.clean();
        }
        GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, true, {
            transaction: transaction,
            jeton: jeton
        });
    }

    endEnchere(montant, joueur) {
        GestionEnchereDisplayer.displayCloseOption(montant, joueur);
    }

    joueDes(sommeDes) {
        this.moveTo(sommeDes);
    }

    moveTo(nb) {
        const nextCase = this.pion.deplaceValeursDes(nb);
        this.joueSurCase(nextCase);
    }

    /* Joueur sur une case precise */
    joueSurCase(fiche, direct, primeDepart = true) {
        this.pion.goto(fiche.axe, fiche.pos, () => doActions(this), direct, primeDepart);
    }

    joueSurCaseNoAction(fiche) {
        this.pion.goto(fiche.axe, fiche.pos, () => {
        });
    }

    // Fonction a ne pas implementer avec un vrai joueur
    joue() {
    }

    /* Pour le des rapide, choisi la combinaison de des qu'il souhaite */
    choisiDes(des1, des2, callback) {
        if (!callback) {
            return;
        }

        let options = [
            {title: (des1 + ' + ' + des2), fct: () => callback(des1 + des2)},
            {title: (des1), fct: () => callback(des1)},
            {title: (des2), fct: () => callback(des2)}
        ];
        const message = 'Quel(s) dé(s) vous choisissez';
        infoMessage.createGeneric(this, 'Vous prenez le bus', 'green', message, options);
    }

    /* Le joueur se deplace sur la case qu'il souhaite */
    choisiCase(callback) {
        infoMessage.create(this, "Triple dé", "green", "Choisissez votre case", () => {
            this.enableMouseFunction(callback);
        });
    }

    // Fonction a ne pas implementer avec un vrai joueur
    actionApresDes() {
    }

    // Fonction a ne pas implementer pour un vrai joueur
    actionAvantDesPrison() {
    }

    // Achete une propriete
    /* @param montant : montant a payer si different du prix d'achat (cas des encheres) */
    acheteMaison(maison, montant = maison.achat) {
        // On verifie l'argent
        if (maison === undefined || montant > this.montant) {
            throw "Achat de la maison impossible";
        }
        if (maison.isLibre()) {
            this.showAcheteMaison(maison);
            this.payer(montant);
            this.notifyAcheteMaison(maison, montant);
        }
    }

    showAcheteMaison(maison) {
        this._drawTitrePropriete(maison);
        maison.vendu(this);

    }

    /* Refuse l'achat d'une propriete. La banque peut mettre aux encheres le terrain */
    refuseMaison(maison, callback = () => {
    }) {
        bus.send('monopoly.visiteMaison', {joueur: GestionJoueur.getJoueurCourant(), maison: maison});
        this.notifyMessage('monopoly.visiteMaison', '', {maison: maison.id});
        if (VARIANTES.enchereAchat) {
            this._enchereByBanque(maison, callback);
        } else {
            callback();
        }
    }

    _enchereByBanque(maison, callback) {
        GestionEnchere.init(maison, maison.achat, true, callback);
    }

    _drawTitrePropriete(maison) {
        let m = this.maisons.cherchePlacement(maison);
        let input = `<input type="button" id="idInputFiche${maison.id}" class="ui-corner-all fiche color_${maison.color.substring(1)}" value="${maison.nom}" id="fiche_${maison.id}"/>`;
        if (m != null) {
            m.insertAdjacentHTML('afterend', input)
        } else {
            this.div.insertAdjacentHTML('beforeend',input);
        }
        maison.input = document.querySelector(`input[id="idInputFiche${maison.id}"]`);
        if (maison.statutHypotheque === true) {
           maison.input.classList.add('hypotheque');
        }
        maison.input.onclick = () => FicheDisplayer.openDetail(GestionFiche.getById(maison.id), maison.input);

    }

    /* Permet de deplacer le terrain sur le joueur lors d'un echange */
    getSwapProperiete(maison) {
        maison.input.remove();
        maison.input = null;
        this._drawTitrePropriete(maison);

        // On supprime l'ancien proprio
        if (maison.joueurPossede) {
            maison.joueurPossede.maisons.remove(maison);
        }
        maison.setJoueurPossede(this);
    }

    // Envoi le joueur (et le pion) en prison
    goPrison(notify = true) {
        this.showPrison();
        this.nbDouble = 0;
        if (notify) {
            this.notifyPrison();
        }
        this.pion.goPrison(() => GestionJoueur.change());
        bus.send("monopoly.goPrison", {
            joueur: this
        });
    }

    showPrison() {
        this.enPrison = true;
        this.div.querySelector('.joueur-id').classList.add('jail');
    }

    exitPrison(info = {notrigger: false, notify: true, paye: false, carte: false}) {
        this.enPrison = false;
        this.nbDouble = 0;
        this.div.querySelector('.joueur-id²').classList.remove('jail')
        if (info.notify) {
            this.notifyExitPrison(info.paye, info.carte)
        }
        if (!info.notrigger) {
            bus.send("monopoly.exitPrison", {
                joueur: this,
                paye: info.paye,
                carte: info.carte
            });
        }
    }

    isEnPrison() {
        return this.enPrison;
    }

    setDiv(div){
        this.div = div;
        this.setArgent(this.montant);
    }

    setArgent(montant) {
        if (montant === undefined) {
            throw "error montant";
        }
        this.montant = montant;
        this.div.querySelector('.compte-banque').textContent = montant;
    }

    payerParcGratuit(parc, montant, callback = () => {
    }) {
        try {
            this.payer(montant, () => {
                if (VARIANTES.parcGratuit) {
                    parc.payer(montant);
                }
                callback();
            });
        } catch (insolvable) {
            callback();
        }
    }

    setPion(color, img, montantDepart) {
        this.pion = new Pion(color, this, img, montantDepart);
    }

    /* Verifie si le joueur peut payer ses dettes */
    isSolvable(montant) {
        return this.getStats().argentDispo >= montant;
    }

    /* Paye la somme demandee. Si les fonds ne sont pas disponibles, l'utilisateur doit d'abord réunir la somme, on le bloque */

    /* @param callback : action a effectuer apres le paiement */
    payer(montant, callback = () => {
    }) {
        // On verifie si c'est possible de recuperer les sommes
        if (this.getStats().argentDispo < montant) {
            // Banqueroute, le joueur perd
            this.doDefaite();
            throw "Le joueur " + this.nom + " est insolvable";
        }

        /* Verifie si le joueur peut payer */
        this.notifyPay(montant);
        if (this.montant - montant < 0) {
            this.bloque = true;
            this.resolveProblemeArgent(montant, callback);
        } else {
            this.setArgent(this.montant - montant);
            callback();
        }
    }

    // Create an event which notify buy
    notifyAcheteMaison(terrain, montant) {}

    notifyHypotheque() {}

    notifyLeveHypotheque() {}

    notifyPay() {}

    notifyMessage() {}

    notifyPrison() {
        Notifier.goPrison(this);
    }

    notifyExitPrison(paye = false, carte = false) {
        Notifier.exitPrison(this, paye, carte);
    }

    /* Paye une somme a un joueur */
    /* Si le joueur ne peut pas payer, une exception est lancee (il a perdu). On recupere le peut d'argent a prendre */
    /* Payer est potentiellement asynchrone (resolve manuel), on indique l'etape suivante en cas de reussite */

    // Attention, en cas de reseau, il faut que le joueur recoive l'argent, meme s'il est remote. L'instruction de gain est envoyé spécifiquement
    payerTo(montant, joueur, callback) {
        let argentDispo = this.getStats().argentDispo;
        try {
            this.payer(montant, () => {
                joueur.gagner(montant);
                if (callback != null) {
                    return callback();
                }
                GestionJoueur.change();
            });
        } catch (insolvable) {
            // Le joueur n'est pas solvable, on se sert sur le reste
            if (joueur != null) { // Pb quand amende ?
                joueur.gagner(argentDispo);
            }
            GestionJoueur.change();
        }
    }

    gagner(montant) {
        this.setArgent(this.montant + montant);
    }

    /* Gestion de la defaite */
    doDefaite() {
        // On laisse juste le nom et on supprime le reste, on supprime le pion, on remet les maison a la vente
        // Le banquier peut mettre aux encheres les terrains
        this.maisons.libere();
        bus.refresh(); // Pour supprimer les terrains
        this.updateMaisonsByGroup();
        this.div.querySelector('input').remove();
        this.pion.remove();
        // On affiche un style sur la liste
        this.div.querySelector('.joueurCourant').classList.add('defaite');
        this.setArgent(0);
        this.defaite = true;
        this.tourDefaite = globalStats.nbTours;
        bus.send("monopoly.defaite", {
            joueur: this
        });
    }

    /* Resoud les problemes d'argent du joueur */
    /* @param montant : argent a recouvrer */

    /* @param joueur : beneficiaire */
    resolveProblemeArgent(montant, callback) {
        // On ouvre le panneau de resolution en empechant la fermeture
        this.montant -= montant;
        infoMessage.create(this, "Attention", "red", "Vous n'avez pas les fonds necessaires, il faut trouver de l'argent", () => {
            // On attache un evenement a la fermeture
            let onclose = (e) => {
                if (this.montant < 0) {
                    // Message d'erreur pas possible
                    infoMessage.create(this, "Attention", "red", "Impossible, il faut trouver les fonds avant de fermer");
                    //e.preventDefault();
                    return false;
                } else {
                    this.bloque = false;
                    this.setArgent(this.montant);
                    callback();
                    return true;
                }
            }
            GestionTerrains.open(true, onclose);
        });
        return true;
    }

    updateMaisonsByGroup() {
        let groups = this.maisons.findMaisonsByGroup();
        //let div = $('.count-property', this.div);
        const div = this.div.querySelector('.count-property');
        div.querySelector('.counter-group').innerHTML = 0;
        //$(".counter-group", div).html(0);
        for (const group in groups) {
            let color = group.replace(/ /g, "");
            //$(`.counter-group.${color}`, div).html(groups[group].length);
            div.querySelector(`.counter-group.${color}`).innerHTML = groups[group].length;
        }
    }

    endTurn() {
    }
}

// Used only when master play
class NetworkJoueur extends Joueur {
    constructor(numero, nom, color, argent, montantDepart) {
        super(numero, nom, color, argent, montantDepart);
    }

    moveTo(nb) {
        const nextCase = this.pion.deplaceValeursDes(nb);
        Notifier.moveTo(GestionFiche.buildId(nextCase), this);
        this.joueSurCase(nextCase);
    }

    joueSurCase(fiche, direct, primeDepart = true, notify = false) {
        super.joueSurCase(fiche, direct, primeDepart);
        if (notify) {
            Notifier.moveTo(GestionFiche.buildId(fiche), this);
        }
    }

    actionApresDes(buttons) {
        // Detecte action apres lancement des comme sortie prison (mouvement double, paiement)
        // Si un seul bouton, executer l'action
    }

    gagner(montant) {
        this.setArgent(this.montant + montant);
        Notifier.gagner(montant, this);
    }

    notifyPay(montant) {
        Notifier.payer(montant, this);
    }

    notifyMessage(name, libelle, payload) {
        Notifier.notifyMessage(name, libelle, this, payload);
    }

    notifyHypotheque(terrain) {
        Notifier.hypotheque(terrain, this);
    }

    notifyLeveHypotheque(terrain) {
        Notifier.leveHypotheque(terrain, this);
    }

    notifySelect() {
        Notifier.notifySelect(this);
    }

    notifyAcheteMaison(terrain, montant) {
        Notifier.notifyAcheteMaison(terrain, montant, this);
    }

    notifyDices(dices, event) {
        Notifier.dices(dices, event, this);
    }
}

let Notifier = {
    askDices(player) {
        bus.network({
            kind: "launchDices",
            player: player.id
        });
    },
    dices(dices, event, player) {
        delete event.joueur;
        const sendEvent = deepCopy({
            kind: "dices",
            player: player.id,
            dice1: dices[0],
            dice2: dices[1],
            quickDice: dices[2]
        }, event);
        /*let sendEvent = $.extend({
            kind: "dices",
            player: player.id,
            dice1: dices[0],
            dice2: dices[1],
            quickDice: dices[2]
        }, event);*/
        bus.network(sendEvent);
    },
    hypotheque(terrain, player) {
        bus.network({
            kind: "hypotheque",
            terrain: terrain.id,
            player: player.id
        });
    },
    leveHypotheque(terrain, player) {
        bus.network({
            kind: "leveHypotheque",
            terrain: terrain.id,
            player: player.id
        });
    },
    move(nb, player) {
        bus.network({
            kind: "move",
            player: player.id,
            nb: nb
        });
    },
    moveTo(to, player) {
        bus.network({
            kind: "moveTo",
            player: player.id,
            to: to
        });
    },
    notifySelect(player) {
        bus.network({
            kind: "change",
            player: player.id
        });
    },
    goPrison(player) {
        bus.network({
            kind: "prison",
            player: player.id,
        });
    },
    exitPrison(player, paye, carte) {
        bus.network({
            kind: "exitPrison",
            player: player.id,
            paye: paye,
            carte: carte
        });
    },
    payer(montant, player) {
        bus.network({
            kind: "tax",
            player: player.id,
            montant: montant
        });
    },
    gagner(montant, player) {
        bus.network({
            kind: "earn",
            player: player.id,
            montant: montant
        });
    },
    notifyAcheteMaison(terrain, montant, player) {
        bus.network({
            kind: "buy",
            player: player.id,
            terrain: terrain.id,
            montant: montant,
        });
    },
    notifyMessage(name, libelle, player, payload = {}) {
        bus.network({
                kind: 'message',
                player: player.id,
                libelle: libelle,
                name: name,
                ...payload});
    },
    notifyEnd() {
        bus.network({
            kind: "end"
        });
    }
}

export {Joueur, NetworkJoueur, PlayerSaver, Maisons, Notifier};
