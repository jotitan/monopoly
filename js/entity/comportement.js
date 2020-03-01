/* Gestion du comportement*/

import {GestionFiche} from "../display/case_jeu.js";
import {GestionJoueur} from "../gestion_joueurs.js";

/* @Abstract */
/* Objet qui gere le comportement (rapport a l'argent). Integre la prise de risque (position du jour) */
/* @risque : prise de risque entre 0 et 1 */

class Comportement {
    constructor(risque, name, id) {
        this.risque = risque;
        this.probaDes = [0, 2.77, 5.55, 8.33, 11.1, 13.8, 16.7, 13.8, 11.1, 8.33, 5.55, 2.77];
        this.name = name;
        this.id = id;
    }

    /* Indique le risque global a depenser cette somme pour le joueur */
    /* Se base sur 3 informations : 
      1 : le montant a depenser par rapport a l'argent disponible.
      2 : le risque de tomber prochainement sur un loyer eleve 
      3 : le cout du plus fort loyer du plateau 
          Plus le risque est grand, plus il est important
      */
    getRisqueTotal(joueur, cout) {
        let risque1 = this.calculMargeMontant(joueur, cout);
        let risque2 = this.calculRisque(joueur, joueur.montant);

        return risque1 * (risque2 / 100 + 1);
    }

    /* Determine le budget max pour un indicateur de strategie donne */
    /* Plafonne l'enchere max (comme les propositions ?) */
    getMaxBudgetForStrategie (joueur, strategieValue) {
        // Renvoie la valeur du cout pour que getRisqueTotal = strategieValue
        let risque = this.calculRisque(joueur, joueur.montant);
        let marge = strategieValue / (risque / 100 + 1);
        // On ajoute un random sur 10% du prix => moins previsible
        let montant = this.findCoutFromFixMarge(joueur, marge);
        montant+=Math.round((montant*0.1)*(((Math.random()* 1000)%10 -5)/10));
        return Math.min(montant, joueur.montant - joueur.minimumPriceHouse());
    }

    /* Appele lorsqu'une proposition a deja ete faite et qu'elle etait insuffisante */
    getFactorForProposition() {
        return 1 + this.risque;
    }

    /* Calcul le budget depensable pour la construction de maison / hotel */
    /* Prendre en compte l'achat potentiel de nouveau terrain. Pour la strategie, on calcule les terrains qui interessent */
    /* @param forceHypotheque : si vrai, on force l'usage de l'argent dispo apres hypotheque */
    getBudget (joueur, forceHypotheque) {
        let assiette = joueur.montant; // Utilise pour calculer les risques
        // Si le joueur est une charogne, on utilise l'argent dispo avec les possibles hypotheques (tous les terrains sauf les groupes). 
        // Utilise uniquement pour le calcul de risque, pas pour l'achat (pour ne pas hypothequer lors de l'achat).
        if (forceHypotheque === true || this.risque > 0.6) {
            assiette = joueur.getStats().argentDispoHypo;
        }
        // On prend le plus fort loyer du plateau
        let maxLoyer = this.plusFortLoyer(joueur);
        // On prend l'argent pondere par le risque
        let risque = this.calculRisque(joueur, assiette);
        // On pondere le loyer max par le carre du risque afin d'augmenter exponentiellement son importance
        return Math.round((joueur.montant - maxLoyer * (1 - this.risque * this.risque)) * (1 - risque / 100));
    }

    /* Calcul le terrain du joueur sur lesquels les adversaires peuvent tomber */
    /* @param seuil : seuil a partir duquel on renvoie les maisons */
    getNextProprietesVisitees (joueur) { //,seuil){
        let maisons = [];
        GestionJoueur.forEach(j=>{
            if (!j.equals(joueur)) {
                // On parcours toutes les statistiques et on mesure le risque de tomber sur une propriete du joueur
                for (let i = 1; i < 12; i++) {
                    let fiche = GestionFiche.get(j.pion.deplaceValeursDes(i));
                    if (fiche.isTerrain() && fiche.joueurPossede != null && fiche.joueurPossede.equals(joueur)) {
                        //maison visitable, on ajoute la maison avec la proba
                        if (maisons[fiche.id] != null) {
                            maisons[fiche.id].proba += this.probaDes[i] / 100;
                        } else {
                            maisons[fiche.id] = ({
                                proba: this.probaDes[i] / 100,
                                maison: fiche
                            });
                        }
                    }
                }
            }
        },this);
        return maisons;
    }

    /* Calcule la marge d'achat par rapport au montant et le pondere par rapport a la prise de risque. */
    /* Plus il est grand, plus c'est risque */
    calculMargeMontant (joueur, cout) {
        let marge = cout / joueur.montant; // inferieur a 1
        return marge / this.risque;
    }

    /* Calcul le cout pour une marge donnee */
    findCoutFromFixMarge (joueur, marge) {
        return (marge * this.risque) * joueur.montant;
    }

    /* Se base sur les prochaines cases a risque qui arrive, renvoi un pourcentage */
    calculRisque (joueur, argent) {
        // On calcul le risque de tomber sur une case cher.
        // On considere un risque quand on est au dessus de risque * montant d'amende)
        let position = joueur.pion.position;
        let axe = joueur.pion.axe;
        let stats = 0;
        for (let i = 1; i <= 12; i++) {
            let pos = GestionFiche.nextPos(axe, position);
            axe = pos.axe;
            position = pos.position;
            let fiche = GestionFiche.getById(axe + "-" + position);
            if (fiche != null && fiche.getLoyer != null && fiche.joueurPossede != null && !fiche.joueurPossede.equals(joueur) && (fiche.getLoyer() > (argent * this.risque))) {
                stats += this.probaDes[i - 1];
            }
        }
        return stats;
    }

    // calcul le loyer le plus fort du joueur (et n'appartenant pas au joueur). Permet de connaitre la treso max que le joueur peut posseder sur lui
    plusFortLoyer (joueur) {
        let max = joueur.montantDepart; // Prix de l'impot sur le revenu, comme le depart
        let it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            let f = it.next();
            if (f.getLoyer != null && f.joueurPossede != null && !joueur.equals(f.joueurPossede) && f.getLoyer() > max) {
                max = f.getLoyer();
            }
        }
        return max;
    }

    // calcul le loyer moyen que peut rencontrer le joueur
    getLoyerMoyen (joueur) {
        let montant = joueur.montantDepart; // Prix de l'impot sur le revenu, comme le depart
        let nb = 1;
        let it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            let f = it.next();
            if (f.getLoyer != null && f.joueurPossede != null && !joueur.equals(f.joueurPossede)) {
                montant += f.getLoyer();
                nb++;
            }
        }
        return {
            montant: montant / nb,
            nb: nb
        };
    }
}

/* Implementations */

class CheapComportement extends Comportement {
    constructor(){
        super(0.25, "Prudent", 0);
    }
}

class MediumComportement extends Comportement {
    constructor() {
        super(0.5, "Normal", 1);
    }
}

class HardComportement extends Comportement {
    constructor() {
        super(0.8, "Fou", 2);
    }
}

let GestionComportement = {
    comportements : [CheapComportement,MediumComportement,HardComportement],
    create:function(id){
        return new this.comportements[id]();
    },
    createRandom:function(){
        return this.create(Math.round(Math.random() * 1000)%this.comportements.length);
    },
    getAll:function(){
        return this.comportements;
    },
    length:function(){
        return this.comportements.length;
    }
};

export {GestionComportement};