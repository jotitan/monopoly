/* Gestion de la strategie */
import {GestionFiche} from "../display/case_jeu.js";
import {ETAT_LIBRE} from "../display/case_jeu.js";
import {GestionJoueur} from "../gestion_joueurs.js";

/* @Abstract */
/* Objet qui gere la strategie. IL y a differentes implementations */
/* @colors : liste des groupes qui interessent le joueur */
/* @param agressif : plus il est eleve, plus le joueur fait de l'antijeu (achat des terrains recherches par les adversaires) */
class Strategie {
    constructor(colors, agressif, name, id, interetGare=(Math.round(Math.random() * 1000) % 3 === 0)) {
        this.groups = colors;
        this.agressif = agressif;
        this.interetGare = interetGare; // Interet pour gare
        this.name = name;
        this.id = id;
    }

    _containGroup(value) {
        for (let val in this.groups) {
            if (this.groups[val] === value) {
                return true;
            }
        }
        return false;
    }

    /* Renvoie des stats sur les proprietes concernees par cette strategie : nombre de propriete, nombre de libre... */
    getStatsProprietes(){
        let stats = {
            color: {
                total: 0,
                libre: 0,
                achete: 0,
                pourcent: 0
            },
            all: {
                total: 0,
                libre: 0,
                achete: 0,
                pourcent: 0
            }
        };
        let it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            let fiche = it.next();
            if (fiche.statut != null) {
                stats.all.total++;
                if (fiche.statut === ETAT_LIBRE) {
                    stats.all.libre++;
                } else {
                    stats.all.achete++;
                }
                if (this._containGroup(fiche.color)) {
                    stats.color.total++;
                    if (fiche.statut === ETAT_LIBRE) {
                        stats.color.libre++;
                    } else {
                        stats.color.achete++;
                    }
                }
            }
        }
        stats.color.pourcent = (stats.color.libre / stats.color.total) * 100;
        stats.all.pourcent = (stats.all.libre / stats.all.total) * 100;
        return stats;
    }

    /* Calcul l'interet global du joueur pour une propriete */
    /* Prend en compte l'interet propre (liste d'achat) ainsi que l'etat du groupe */
    /* Si ce n'est pas un terrain (gare, compagnie), la valeur est plus faible */
	/* @param isEnchere : indique que la mesure est faite pour une enchere */
	/* Cas des encheres, on ajoute un critere qui determine si le terrain est indispensable pour la strategie : autre groupe, autre terrain... */
	interetGlobal(propriete, joueur, isEnchere) {
        let i1 = this.interetPropriete(propriete);
        let statutGroup = this.statutGroup(propriete, joueur, isEnchere);
        let i2 = statutGroup.statut;
        let interet = {interet:1};
		if (i1 === false && i2 === 0) {
            interet = {interet:0.2};	// Permet en cas de situation tres confortable de continuer a investir
        }
		// Realise un blocage
        if (i1 === false && i2 === 2) {
            interet = {interet:this.agressif,joueur:statutGroup.joueur};
        }
        if (i1 === true && i2 === 3) {
            interet = {interet:4};
        }
		// Pas dans la strategie mais permet de completer le groupe et de construire
		if (i1 === false && i2 === 3) {
            interet = {interet:2};
        }
		// En possede deja
		if(i1 === true && i2 === 5){
            interet = {interet:1.5};
		}
        if(isEnchere){
            interet = {interet:this.interetProprieteInStrategie(propriete)};
        }
        if(!propriete.isTerrain()){
            interet.interet/=2;
        }
        
        return interet;
    }

	/* Determine l'interet de la propriete par rapport a l'etat de la strategie */
    /* @return : un nombre inférieur à 1 */
	interetProprieteInStrategie (){
        let stats = this.getStatsProprietes();
        /* Si les terrains sont presques tous libres, renvoie un calcul logarithmique (entre 67 et 100% de terrain libre) */
        return 0.5 + parseFloat((Math.log(((Math.min(100-stats.color.pourcent,32.5))/50)+1)).toFixed(2));    
	}
	
    /* Calcul l'interet pour la maison (a partir des groupes interessant) */
    interetPropriete (propriete) {
        for (let color in this.groups) {
            if (this.groups[color] === propriete.color || (propriete.type === 'gare' && this.interetGare)) {
                return true;
            }
        }
        return false;
    }

    /* Renvoie le statut de la famille : 
          0 : toutes les proprietes sont libres
          1 : s'il reste des libres apres celle ci
          2 : si toutes appartiennent a une meme personne sauf celle-ci
          3 : si toutes appartiennent au joueur sauf celle-ci
          4 : autres 
		  5 : joueur en possede deja une de la famille */
    /* @param isEnchere : achat du terrain a un autre joueur, on ne prend pas en compte le statut libre */
    statutGroup (propriete, joueur, isEnchere) {
        let nbTotal = 0;
        let nbLibre = 0;
        let dernierJoueur = null;
        let nbEquals = 0;
        let nbPossede = 0;
        for (let id in propriete.groupe.fiches) {
            let fiche = propriete.groupe.fiches[id];
            nbTotal++;
            if (fiche.statut === ETAT_LIBRE) {
                nbLibre++;
            } else {
                if (fiche.joueurPossede.equals(joueur)) {
                    nbPossede++;
                } else {
                    if (dernierJoueur == null || fiche.joueurPossede.equals(dernierJoueur)) {
                        nbEquals++;
                    }
                }
                dernierJoueur = fiche.joueurPossede;
            }
        }
        if (nbLibre === nbTotal) {
            return {statut:0};
        }

        if (nbLibre === 1 && nbEquals === nbTotal - 1) {
            return {statut:2,joueur:dernierJoueur};
        }
        /* Cas ou seul terrain manquant */
        if ((nbLibre === 1 || isEnchere) && nbPossede === nbTotal - 1) {
            return {statut:3};
        }
		/* Cas ou on en possede deja 1 */
		if (nbPossede > 0 && nbLibre > 0) {
            return {statut:5};
        }
        if (nbLibre > 0) {
            return {statut:1};
        }
        return {statut:4};
    }

    /* Calcule le fait d'accepter un terrain d'un joueur.
     * Se base sur le fait que le joueur a un deja un groupe, qu'il n'en a aucun.
     * Renvoie un facteur jouant sur le calcul final. 0 est bloquant, 1 est neutre...
     * @param otherInteresets : autres terrains qui interesent le joueur
     * @param interestGroupe : indique que le groupe interesse aussi le joueur
     */
    acceptSwapTerrain (terrain, joueur, otherInterests, interestGroupe) {
        /* Calcule si le proprio est le seul fournisseur */
        let alone = GestionJoueur.getNb() > 2; // Faux si seulement 2 joueurs
        /* Seul groupe qui m'interesse, on refuse */
        if ((interestGroupe === true && otherInterests.length === 1) || terrain.isGroupee()) {
            return 0;
        }
        for (let idx in otherInterests) {
            if (!otherInterests[idx].maison.joueurPossede.equals(terrain.joueurPossede)) {
                alone = false;
            }
        }
        let nbGroups = joueur.maisons.findConstructiblesGroupes().size();
        /* Le proprio est le seul a pouvoir aider le demandeur et il n'a pas encore de groupe */
        if (nbGroups === 0 && otherInterests.length === 0 && alone) {
            return this.agressif === 2 ? 0.5 : 1;
        }
        /* Beaucoup de groupe et seul fournisseur, on bloque si on est vicieux, on monte sinon */
        if (nbGroups >= 2 && alone) {
            return this.agressif > 0 ? 0 : 0.5;
        }

        /* Personne n'a de groupe et pas seul fournisseur */
        if (nbGroups === 0) {
            return 1.5;
        }

        /* Beaucoup de groupe mais pas le seul fournisseur, on ne bloque pas */
        if (nbGroups >= 2) {
            return this.agressif > 0 ? 0.5 : 1;
        }
        return 1;
    }
	
	toString(){
		return this.name + ((this.interetGare)?' <img src="img/little_train.png" style="width:20px;height:16px;"/>':'');
	}
}

/* Achete en priorite les terrains les moins chers : bleu marine-812B5C, bleu clair-119AEB, violet-73316F et orange-D16E2D */
class CheapStrategie extends Strategie {
    constructor() {
        super(["#812B5C", "#119AEB", "#73316F", "#D16E2D"], 0, "Econome", 0);
    }
}

/* Achete en priorite les terrains moyennement chers : violet-73316F, orange-D16E2D, rouge-D32C19 et jaune-E6E018 */
class MediumStrategie extends Strategie {
    constructor() {
        super(["#73316F", "#D16E2D", "#D32C19", "#E6E018"], 1, "Normal", 1);
    }
}

/* Achete en priorite les terrains les plus chers : rouge-D32C19, jaune-E6E018, vert-11862E et bleu fonce-132450 */
class HardStrategie extends Strategie {
    constructor() {
        super(["#D32C19", "#E6E018", "#11862E", "#132450"], 2, "Luxe", 2);
    }
}

/* Achete en priorite les terrains les meilleurs (gare, orange-D16E2D, rouge-D32C19, jaune-E6E018) */
class SmartStrategie extends Strategie {
    constructor() {
        super(["#D16E2D", "#D32C19", "#E6E018"], 2, "Futé", 3, true);
    }
}

/* Achete tout */
class CrazyStrategie extends Strategie {
    constructor() {
        super(["#812B5C", "#119AEB", "#73316F", "#D16E2D", "#D32C19", "#E6E018", "#11862E", "#132450"], 4, "Dingue", 3, true);
    }
}

let GestionStrategie = {
	strategies : [CheapStrategie, MediumStrategie, HardStrategie,SmartStrategie,CrazyStrategie],
	create:function(id){
		return new this.strategies[id]();
	},
	createRandom:function(){
		return this.create(Math.round(Math.random() * 1000)%this.strategies.length);
	},
	getAll:function(){
		return this.strategies;
	},
	length:function(){
		return this.strategies.length;
	}
};

export {GestionStrategie};