/* Gestion du Monopoly */
/* Dependances a charger : */
/* * GestionConstructions.js */
/* * Graphics.js */
/* * SquareGraphics.js */

/* TODO : Permettre l'achat de terrain hors strategie quand on est blinde et qu'on a deja des groupes et des constructions dessus */
/* -- TODO : Echange uniquement quand tous les terrains sont vendus. La banque vend (quand on achete pas) ou quand un joueur perd */
/* GetBudget quand Cheap tres dur (evaluation du terrain le plus cher). Ponderer avec l'existance de constructions pour forcer a construire */
/* TODO : proposer tout de même un terrain si deja une oldProposition */
/* -- TODO : mettre un plafond sur une proposition (fonction logarithmique : (14-ln(x)*x) => marche pas */
/* -- BUG : echange un terrain contre un terrain du meme groupe */
/* TODO : changer strategie quand deux terrains du meme groupe. Ne pas les enchanger contre une merde */
/* --TODO : plafonner argent a mettre dans une enchere (depend du prix de base). Encore trop cher (gare a 60K). Moins d'importance sur une gare */
/* TODO : pour contre propal, demander argent si besoin de construire */
/* --TODO : integrer les contres sur les encheres (n'encherie que si la personne vraiment interesse pose une enchere */
/* IDEE : Cassandra, Ring, Hash */
/* BIG TODO : implementation du des rapide */
/* BIG TODO : super monopoly ? */
/* TODO : pour echange, si argent dispo et adversaire dans la deche, on propose une grosse somme (si old proposition presente) */
/* TODO : permettre le packaging */


// Defini la methode size. Cette methode evite d'etre enumere dans les boucles
Object.defineProperty(Array.prototype, "size", {
    value: function () {
        var count = 0;
        for (var i in this) {
            count++;
        }
        return count;
    },
    writable: false,
    enumerable: false,
    configurable: false
});

Object.defineProperty(Array.prototype, "contains", {
    value: function (value) {
        for (var i in this) {
            if (this[i] == value) {
                return true;
            }
        }
        return false;
    },
    writable: false,
    enumerable: false,
    configurable: false
});


$.bind = function (eventName, fct) {
    $('body').bind(eventName, fct);
    return $('body');
}

$.trigger = function (eventName, params) {
    $('body').trigger(eventName, params);
}

var DEBUG = false;
var IA_TIMEOUT = 1000; // Temps d'attente pour les actions de l'ordinateur

/* Gestion des variantes, case depart (touche 40000) et parc gratuit (touche la somme des amendes) */
/* Conf classique : false,false,true,true */
var VARIANTES = {
    caseDepart: false, 		// Double la prime sur la case depart
    parcGratuit: false, 	// Toutes les taxes sont verses au parc gratuit
    enchereAchat: false, 	// Permet la mise aux encheres d'un terrain qu'un joueur ne veut pas acheter
	echangeApresVente: false,	// Permet d'echanger des terrains meme quand ils ne sont pas vendus
}

var stats = {	// Statistiques
	nbTours:0,
	heureDebut:new Date(),
	positions:[]
}	
var nbTours = 0; // Nombre de tours de jeu depuis le depuis (nb de boucle de joueurs)
var currentSauvegardeName = null; // Nom de la sauvegarde en cours
var plateau = null;	// Info du plateau
var currentPlateauName = null;	// Plateau charge

/* Liste des cases et des cartes */
var cartesChance = new Array();
var cartesCaisseCommunaute = new Array();
var parcGratuit = null;
var currentFiche = null;

/* Liste des joueurs */
var joueurs = new Array();
var joueurCourant = null;
var colorsJoueurs = ["#383C89", "#A6193E", "#C58F01", "#086B3D", "#B9B29B","#663300"];
var constructions = {
    maison: 32,
    hotel: 12
};

var CURRENCY = "F.";

/* Dimensions du plateau */
var largeur = 65;
var hauteur = 100;
var total = (largeur * 9) / 2;
var centre = 400;
var bordure = 20;
var largeurPion = (largeur - 5) / 3;

// Parametrage des titres
var titles = {};
var nomsJoueurs = [];

/* Permet de gerer les fiches */
var GestionFiche = {
    fiches: [],
    keys: [], // Cles des fiches
    getById: function (id) {
        return this.fiches[id];
    },
    get: function (info) {
        return this.fiches[info.axe + "-" + info.pos];
    },
    add: function (fiche) {
        this.fiches[fiche.id] = fiche;
        this.keys.push(fiche.id);
    },
    /* Renvoie les terrains libres */
    getFreeFiches: function () {
        var frees = [];
        for (var id in this.fiches) {
            if (this.fiches[id].statut == ETAT_LIBRE) {
                frees.push(this.fiches[id]);
            }
        }
        return frees;
    },
	/* Renvoie vrai s'il reste des terrains libres */
	isFreeFiches:function(){
		for (var id in this.fiches) {
            if (this.fiches[id].statut == ETAT_LIBRE) {
                return true;
            }
        }
		return false;
	},
    /* iterateur pour parcourir les fiches */
    iterator: function () {
        return {
            pointer: 0,
            hasNext: function () {
                return this.pointer < GestionFiche.keys.length;
            },
            next: function () {
                return GestionFiche.fiches[GestionFiche.keys[this.pointer++]];
            }
        }
    },
    /* iterateur pour parcourir les terrains (pas de carte chance, taxe...) */
    iteratorTerrains: function () {
        // On calcule des cles
        var keys = [];
        for (var id in this.fiches) {
            //if(this.fiches[id].constructible || this.fiches[id].type == 'gare' || this.fiches[id].type == 'compagnie'){
            if (this.fiches[id].isTerrain) {
                keys.push(id);
            }
        }
        return this._buildIterator(keys);
    },
    getTerrainsLibres: function () {
        var keys = [];
        for (var id in this.fiches) {
            if (this.fiches[id].isTerrain && this.fiches[id].statut == ETAT_LIBRE) {
                keys.push(id);
            }
        }
        return this._buildIterator(keys);
    },
    _buildIterator: function (keys) {
        return {
            pointer: 0,
            keys: keys,
            hasNext: function () {
                return this.pointer < this.keys.length;
            },
            next: function () {
                return GestionFiche.fiches[this.keys[this.pointer++]];
            }
        }
    },
    nextPos: function (etat, position) {
        position++;
        if (position == 10) {
            etat = (etat + 1) % 4;
            position = 0;
        }
        return {
            "position": position,
            "etat": etat
        };
    }
}


    function createMessage(titre, background, message, call, param, forceshow) {
        $.trigger('monopoly.debug', {
            message: message
        });
        $('#message').prev().css("background-color", background);
        $('#message').dialog('option', 'title', titre);
        $('#message').empty();
        $('#message').append(message);
        var button = {
            "Ok": function () {
                closeMessage();
            }
        };
        $('#message').bind('dialogclose.message', function () {
            if (call != null) {
                call(param);
            }
            $('#message').unbind('dialogclose.message');
        });
        if (call != null) {
            $('#message').dialog('option', 'buttons', button);
        }
        /* On affiche pas le panneau si le timeout est à 0 (partie rapide) */
        if (joueurCourant.canPlay || forceshow) {
            $('#message').dialog('open');
        }
        return button;
    }

    function closeMessage() {
        if ($('#message').dialog('isOpen')) {
            $('#message').dialog('close');
        } else {
            // Trigger de fermeture
            $('#message').trigger('dialogclose.message');
            $('#message').trigger('dialogclose.prison');
        }
    }

    function createPrisonMessage(nbTours, callback) {
        $('#message').prev().css("background-color", "red");
        $('#message').dialog('option', 'title', "Vous êtes en prison depuis " + nbTours + " tours.");
        $('#message').empty();
        $('#message').append("Vous êtes en prison, que voulez vous faire");

        var buttons = {
            "Payer": function () {
                joueurCourant.payer(5000);
				// TODO : Ajouter message pour indiquer qu'il paye
                joueurCourant.exitPrison();
                closeMessage();
            },
            "Attendre": function () {
                closeMessage();
            }
        }
        if (joueurCourant.cartesSortiePrison.length > 0) {
            buttons["Utiliser carte"] = function () {
                joueurCourant.utiliseCarteSortiePrison();
				// TODO : ajouter message pour dire qu'il utilise une carte
                joueurCourant.exitPrison();
                closeMessage();
            }
        }
        $('#message').dialog('option', 'buttons', buttons);
        $('#message').bind('dialogclose.prison', function () {
            $('#message').unbind('dialogclose.prison');
            callback();
        });
        if (joueurCourant.canPlay) {
            $('#message').dialog('open');
        }
        return buttons;
    }

var ETAT_LIBRE = 0;
var ETAT_ACHETE = 1;

function ParcGratuit(axe, pos) {
    this.id = axe + "-" + pos;
    this.montant = null;

    this.drawing = DrawerFactory.getCaseSpeciale(0, "Parc Gratuit");
    Drawer.add(this.drawing);

    this.setMontant = function (montant) {
        this.montant = montant;
        $('#idMontantParc > span').text(this.montant);
    }

    this.payer = function (montant) {
        this.setMontant(this.montant + montant);
    }

    this.action = function () {
        return createMessage("Parc gratuit", "lightblue", "Vous gagnez " + this.montant + " " + CURRENCY, function (param) {
            param.joueur.gagner(param.montant);
            parcGratuit.setMontant(0);
            changeJoueur();
        }, {
            joueur: joueurCourant,
            montant: this.montant
        });
    }

    this.setMontant(0);

}

/* Objet qui gere le comportement (rapport a l'argent). Integre la prise de risque (position du jour) */
/* @risque : prise de risque entre 0 et 1 */

function Comportement(risque, name, id) {
    this.risque = risque;
    this.probaDes = [0, 2.77, 5.55, 8.33, 11.1, 13.8, 16.7, 13.8, 11.1, 8.33, 5.55, 2.77];
    this.name = name;
    this.id = id;

    /* Indique le risque global a depenser cette somme pour le joueur */
    /* Se base sur 3 informations : 
      1 : le montant a depenser par rapport a l'argent disponible.
      2 : le risque de tomber prochainement sur un loyer eleve 
      3 : le cout du plus fort loyer du plateau 
          Plus le risque est grand, plus il est important
      */
    this.getRisqueTotal = function (joueur, cout) {
        var risque1 = this.calculMargeMontant(joueur, cout);
        var risque2 = this.calculRisque(joueur, joueur.montant);

        return risque1 * (risque2 / 100 + 1);
    }

    /* Determine le budget max pour un indicateur de strategie donne */
    /* Plafonne l'enchere max (comme les propositions ?) */
    this.getMaxBudgetForStrategie = function (joueur, strategieValue) {
        // Renvoie la valeur du cout pour que getRisqueTotal = strategieValue
        var risque = this.calculRisque(joueur, joueur.montant);
        var marge = strategieValue / (risque / 100 + 1);
        // On ajoute un random sur 10% du prix => moins previsible
        var montant = this.findCoutFromFixMarge(joueur, marge);
        montant+=Math.round((montant*0.1)*(((Math.random()*1000)%10 -5)/10));
        return Math.min(montant, joueur.montant - 5000);
    }

    /* Appele lorsqu'une proposition a deja ete faite et qu'elle etait insuffisante */
    this.getFactorForProposition = function () {
        return 1 + this.risque;
    }

    /* Calcul le budget depensable pour la construction de maison / hotel */
    /* Prendre en compte l'achat potentiel de nouveau terrain. Pour la strategie, on calcule les terrains qui interessent */
    /* @param forceHypotheque : si vrai, on force l'usage de l'argent dispo apres hypotheque */
    this.getBudget = function (joueur, forceHypotheque) {
        var assiette = joueur.montant; // Utilise pour calculer les risques
        // Si le joueur est une charogne, on utilise l'argent dispo avec les possibles hypotheques (tous les terrains sauf les groupes). 
        // Utilise uniquement pour le calcul de risque, pas pour l'achat (pour ne pas hypothequer lors de l'achat).
        if (forceHypotheque == true || this.risque > 0.6) {
            assiette = joueur.getStats().argentDispoHypo;
        }
        // On prend le plus fort loyer du plateau
        var maxLoyer = this.plusFortLoyer(joueur);
        // On prend l'argent pondere par le risque
        var risque = this.calculRisque(joueur, assiette);
        // On pondere le loyer max par le carre du risque afin d'augmenter exponentiellement son importance
        return Math.round((joueur.montant - maxLoyer * (1 - this.risque * this.risque)) * (1 - risque / 100));
    }

    /* Calcul le terrain du joueur sur lesquels les adversaires peuvent tomber */
    /* @param seuil : seuil a partir duquel on renvoie les maisons */
    this.getNextProprietesVisitees = function (joueur) { //,seuil){
        var maisons = [];
        for (var idJoueur in joueurs) {
            var j = joueurs[idJoueur];
            if (!j.equals(joueur)) {
                // On parcours toutes les statistiques et on mesure le risque de tomber sur une propriete du joueur
                var posActuel = j.getPosition();
                for (var i = 1; i < 12; i++) {
                    var fiche = GestionFiche.get(j.pion.deplaceValeursDes(i));
                    if (fiche.constructible && fiche.joueurPossede != null && fiche.joueurPossede.equals(joueur)) {
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
        }
        return maisons;
    }

    /* Calcule la marge d'achat par rapport au montant et le pondere par rapport a la prise de risque */
    this.calculMargeMontant = function (joueur, cout) {
        var marge = cout / joueur.montant; // inferieur a 1
        return marge / this.risque;
    }

    /* Calcul le cout pour une marge donnee */
    this.findCoutFromFixMarge = function (joueur, marge) {
        var cout = (marge * this.risque) * joueur.montant;
        return cout;
    }

    /* Se base sur les prochaines cases a risque qui arrive, renvoi un pourcentage */
    this.calculRisque = function (joueur, argent) {
        // On calcul le risque de tomber sur une case cher.
        // On considere un risque quand on est au dessus de risque * montant d'amande)
        var position = joueur.pion.position;
        var etat = joueur.pion.etat;
        var stats = 0;
        for (var i = 1; i <= 12; i++) {
            var pos = GestionFiche.nextPos(etat, position);
            etat = pos.etat;
            position = pos.position;
            var fiche = GestionFiche.getById(etat + "-" + position);
            if (fiche != null && fiche.getLoyer != null && fiche.joueurPossede != null && !fiche.joueurPossede.equals(joueur) && (fiche.getLoyer() > (argent * this.risque))) {
                stats += this.probaDes[i - 1];
            }
        }
        return stats;
    }

    // calcul le loyer le plus fort du joueur (et n'appartenant pas au joueur). Permet de connaitre la treso max que le joueur peut posseder sur lui
    this.plusFortLoyer = function (joueur) {
        var max = 20000; // Prix de la taxe de luxe
        var it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            var f = it.next();
            if (f.getLoyer != null && f.joueurPossede != null && !joueur.equals(f.joueurPossede) && f.getLoyer() > max) {
                max = f.getLoyer();
            }
        }
        return max;
    }

    // calcul le loyer moyen que peut rencontrer le joueur
    this.getLoyerMoyen = function (joueur) {
        var montant = 20000; // Prix de la taxe de luxe
        var nb = 1;
        var it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            var f = it.next();
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

var comportements = [CheapComportement,MediumComportement,HardComportement];

function CheapComportement() {
    Comportement.call(this, 0.25, "Prudent", 0);
}

function MediumComportement() {
    Comportement.call(this, 0.5, "Normal", 1);
}

function HardComportement() {
    Comportement.call(this, 0.8, "Fou", 2);
}

/* Objet qui gere la strategie. IL y a differentes implementations */
/* @colors : liste des groupes qui interessent le joueur */
/* @param agressif : plus il est eleve, plus le joueur fait de l'antijeu (achat des terrains recherches par les adversaires) */

function Strategie(colors, agressif, name, id, interetGare) {
    this.groups = colors;
    this.agressif = agressif;
    this.interetGare = (interetGare == null) ? ((Math.round(Math.random() * 1000) % 3 == 0) ? true : false) : interetGare; // Interet pour gare
    this.name = name;
    this.id = id;

    this.groups.contains = function (value) {
        for (var val in this) {
            if (this[val] == value) {
                return true;
            }
        }
        return false;
    }

    /* Renvoie des stats sur les proprietes concernees par cette strategie : nombre de propriete, nombre de libre... */
    this.getStatsProprietes = function () {
        var stats = {
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
        var it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            var fiche = it.next();
            if (fiche.statut != null) {
                stats.all.total++;
                if (fiche.statut == ETAT_LIBRE) {
                    stats.all.libre++;
                } else {
                    stats.all.achete++;
                }
                if (this.groups.contains(fiche.color)) {
                    stats.color.total++;
                    if (fiche.statut == ETAT_LIBRE) {
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
	/* @param isEnchere : indique que la mesure est faite pour une enchere */
	/* Cas des encheres, on ajoute un critere qui determine si le terrain est indispensable pour la strategie : autre groupe, autre terrain... */
	this.interetGlobal = function (propriete, joueur, isEnchere) {
        var i1 = this.interetPropriete(propriete);
        var statutGroup = this.statutGroup(propriete, joueur, isEnchere);
		var i2 = statutGroup.statut;
		var coeff = 1;
		if (i1 == false && i2 == 0) {
            return {interet:0.1};	// Permet en cas de situation tres confortable de continuer a investir
        }
		// Realise un blocage
        if (i1 == false && i2 == 2) {
            return {interet:this.agressif,joueur:statutGroup.joueur};
        }
        if (i1 == true && i2 == 3) {
            return {interet:4};
        }
        if(isEnchere){
            return {interet:this.interetProprieteInStrategie(propriete)};
        }
        
        return {interet:1};
    }

	/* Determine l'interet de la propriete par rapport a l'etat de la strategie */
    /* @return : un nombre inférieur à 1 */
	this.interetProprieteInStrategie = function(propriete){
		var stats = this.getStatsProprietes();
        /* Si les terrains sont presques tous libres, renvoie un calcul logarithmique (entre 67 et 100% de terrain libre) */
        return 0.5 + parseFloat((Math.log(((Math.min(100-stats.color.pourcent,32.5))/50)+1)).toFixed(2));    
	}
	
    /* Calcul l'interet pour la maison (a partir des groupes interessant) */
    this.interetPropriete = function (propriete) {
        for (var color in this.groups) {
            if (this.groups[color] == propriete.color || (propriete.type == 'gare' && this.interetGare)) {
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
          4 : autres */
    /* @param isEnchere : achat du terrain a un autre joueur, on ne prend pas en compte le statut libre */
    // Prendre en compte si j'ai la famille, que c'est la derniere carte. Il faut passer les autres options de risques, prix. Il faut absolument acheter
    this.statutGroup = function (propriete, joueur, isEnchere) {
        var nbTotal = 0;
        var nbLibre = 0;
        var dernierJoueur = null;
        var nbEquals = 0;
        var nbPossede = 0;
        for (var id in propriete.groupe.fiches) {
            var fiche = propriete.groupe.fiches[id];
            nbTotal++;
            if (fiche.statut == ETAT_LIBRE) {
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
        if (nbLibre == nbTotal) {
            return {statut:0};
        }

        if (nbLibre == 1 && nbEquals == nbTotal - 1) {
            return {statut:2,joueur:dernierJoueur};
        }
        /* Cas ou seul terrain manquant */
        if ((nbLibre == 1 || isEnchere) && nbPossede == nbTotal - 1) {
            return {statut:3};
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
    this.acceptSwapTerrain = function (terrain, joueur, otherInterests, interestGroupe) {
        /* Calcule si le proprio est le seul fournisseur */
        var alone = joueurs.length > 2; // Faux si seulement 2 joueurs
        /* Seul groupe qui m'interesse, on refuse */
        if ((interestGroupe == true && otherInterests.length == 1) || terrain.isGroupee()) {
            return 0;
        }
        for (var idx in otherInterests) {
            if (!otherInterests[idx].maison.joueurPossede.equals(terrain.joueurPossede)) {
                alone = false;
            }
        }
        var nbGroups = joueur.findGroupes().size();
        /* Le proprio est le seul a pouvoir aider le demandeur et il n'a pas encore de groupe */
        if (nbGroups == 0 && otherInterests.length == 0 && alone) {
            return this.agressif == 2 ? 0.5 : 1;
        }
        /* Beaucoup de groupe et seul fournisseur, on bloque si on est vicieux, on monte sinon */
        if (nbGroups >= 2 && alone) {
            return this.agressif > 0 ? 0 : 0.5;
        }

        /* Personne n'a de groupe et pas seul fournisseur */
        if (nbGroups == 0) {
            return 1.5;
        }

        /* Beaucoup de groupe mais pas le seul fournisseur, on ne bloque pas */
        if (nbGroups >= 2) {
            return this.agressif > 0 ? 0.5 : 1;
        }
        return 1;
    }
	
	this.toString = function(){
		return this.name + ((this.interetGare)?' <img src="img/little_train.png" style="width:20px;height:16px;"/>':'');
	}
}

var strategies = [CheapStrategie, MediumStrategie, HardStrategie,SmartStrategie,CrazyStrategie]; // liste des strategies

/* Achete en priorite les terrains les moins chers : bleu marine-812B5C, bleu clair-119AEB, violet-73316F et orange-D16E2D */
function CheapStrategie() {
    Strategie.call(this, ["#812B5C", "#119AEB", "#73316F", "#D16E2D"], 0, "Radin", 0);
}

/* Achete en priorite les terrains moyennement chers : violet-73316F, orange-D16E2D, rouge-D32C19 et jaune-E6E018 */
function MediumStrategie() {
    Strategie.call(this, ["#73316F", "#D16E2D", "#D32C19", "#E6E018"], 1, "Normal", 1);
}

/* Achete en priorite les terrains les plus chers : rouge-D32C19, jaune-E6E018, vert-11862E et bleu fonce-132450 */
function HardStrategie() {
    Strategie.call(this, ["#D32C19", "#E6E018", "#11862E", "#132450"], 2, "Luxe", 2);
}

/* Achete en priorite les terrains les meilleurs (gare, orange-D16E2D, rouge-D32C19, jaune-E6E018) */
function SmartStrategie() {
    Strategie.call(this, ["#D16E2D", "#D32C19", "#E6E018"], 2, "Futé", 3, true);
}

/* Achete tout */
function CrazyStrategie() {
    Strategie.call(this, ["#812B5C", "#119AEB", "#73316F", "#D16E2D", "#D32C19", "#E6E018", "#11862E", "#132450"], 4, "Dingue", 3,true);
}

/* Gere l'echange d'une propriete entre deux joueurs */
var GestionEchange = {
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
        $.trigger('monopoly.echange.init', {
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
        $.trigger('monopoly.echange.propose', {
            joueur: GestionEchange.demandeur,
            proposition: proposition
        });
        this.proprietaire.traiteRequeteEchange(this.demandeur, this.terrain, proposition);
    },
    /* Contre proposition du proprietaire, ca peut être des terrains ou de l'argent */
    contrePropose: function (proposition, joueurContre) {
        $.trigger('monopoly.echange.contrepropose', {
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
        $.trigger('monopoly.echange.accept', {
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
            for (var t in this.proposition.terrains) {
                this.proprietaire.getSwapProperiete(this.proposition.terrains[t]);
            }
        }
        this.end();
    },
    reject: function (joueurReject) {
        $.trigger('monopoly.echange.reject', {
            joueur: joueurReject
        });
        // On notifie le joueur et on lui donne le callback(end) pour lancer la suite du traitement
		// Cas de la contreproposition
        if (joueurReject.equals(this.demandeur)) {
            /*this.proprietaire.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.proposition);	*/
			this.demandeur.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.initialProposition);			
        } else {
            this.demandeur.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.proposition);
        }
    }
}


// Faire une clever qui achete les bons terrains

/* Joueur ordinateur */
/* Il faut, a la creation, definir le style de jeu : prudent (achat des deux premiere lignes), agressif (achete tout)
     mode fric (achete les plus chers).*/

    function JoueurOrdinateur(numero, nom, color) {
        Joueur.call(this, numero, nom, color);
        this.canPlay = false;
        this.initialName = nom;
        /* Strategie : definit le comportement pour l'achat des maisons */
        this.strategie = null;
        /* Comportement : definit le rapport e l'argent. Inclu la prise de risque */
        this.comportement = null;
        this.nom = nom;
        this.rejectedPropositions = []; // Sotcke les propositions rejetees

        /* Determine les caracteristiques d'un ordinateur*/
        this.init = function (idStrategie, idComportement) {
            if (idStrategie == null) {
                idStrategie = Math.round(Math.random() * 1000) % strategies.length;
            }
			if (idComportement == null) {
                idComportement = Math.round(Math.random() * 1000) % comportements.length;
            }
			this.strategie = new strategies[idStrategie]();
            this.comportement = new comportements[idComportement]();
            //this.updateName(true);
        }

        this.saveMore = function (data) {
            data.comportement = this.comportement.id;
            data.strategie = this.strategie.id;
            // Charge l'historique des propositions (derniere proposition du terrain)
            data.rejectedPropositions = [];
            for (var id in this.rejectedPropositions) {
                var proposition = this.rejectedPropositions[id][this.rejectedPropositions[id].length -1].proposition;
                var terrains = [];	// On ne garde que les ids des fiches pour eviter les cycles a la sauvegarde
				for(var t in proposition.terrains){
					terrains.push(proposition.terrains[t].id);
				}
				data.rejectedPropositions.push({
                    id: id,
                    proposition: {
						compensation:proposition.compensation,
						terrains:terrains
					}
                });
            }			
        }

        this.loadMore = function (data) {
            this.init(data.strategie, data.comportement);
			this.rejectedPropositions = [];
            if (data.rejectedPropositions != null) {
                for (var id in data.rejectedPropositions) {
					var p = data.rejectedPropositions[id].proposition;
					var terrains = [];
					if(p.terrains!=null){
						for(var t in p.terrains){
							terrains.push(GestionFiche.getById(p.terrains[t]));
						}
					}
					// On ajoute la proposition dans le tableau
                    this.rejectedPropositions[data.rejectedPropositions[id].id] = [{
						compensation:p.compensation,
						terrains:terrains
					}];
                }
            }
        }

        // Fonction appelee lorsque le joueur a la main
        this.joue = function () {
            // On reevalue a intervalle regulier la strategie
            this.changeStrategie();
            // On fait des demandes d'echange de proprietes. Asynchrone, le reste du traitement est  en callback
            var joueur = this;
            this.echangeProprietes(function () {
                // Construit des maisons / hotels
                joueur.buildConstructions();
                // rachete les hypotheques
                joueur.rebuyHypotheque();
                // on lance les des
				$.trigger('monopoly.debug',{message:'joueur ' + joueur.nom + ' joue'});
                GestionDes.lancer();
				//lancerAnimerDes();
            });
        }

        // Fonction appelee lorsque les des sont lances et que le pion est place
        this.actionApresDes = function (buttons, propriete) {
            if (buttons == null) {
                return;
            }
            var current = this;
            setTimeout(function () {
                if (buttons.Acheter != null && propriete != null) {
                    var interet = current.strategie.interetGlobal(propriete).interet;
                    var comportement = current.comportement.getRisqueTotal(current, propriete.achat);
                    $.trigger("monopoly.debug", {
                        message: "Strategie : " + interet + " " + comportement
                    });
                    if (interet > comportement) {
                        $.trigger("monopoly.debug", {
                            message: "IA Achete"
                        });
                        buttons.Acheter();
                        return;
                    }
                }
                for (var i in buttons) {
                    if (i != "Acheter") {
                        buttons[i]();
                        return;
                    }
                }
            }, IA_TIMEOUT);
        }

        this.notifyAcceptProposition = function (callback) {
            if (callback) {
                callback();
            }
        }

        this.notifyRejectProposition = function (callback, terrain, proposition) {
            // On enregistre le refus du proprietaire : le terrain, la proposition et le numero de tour
            // utiliser pour plus tard pour ne pas redemander immediatement
            if (this.rejectedPropositions[terrain.id] == null) {
                this.rejectedPropositions[terrain.id] = [];
            }
            this.rejectedPropositions[terrain.id].push({
                nbTours: nbTours,
                proposition: proposition
            });
            if (callback) {
                callback();
            }
        }

        /* Cherche a echanger des proprietes. Methode bloquante car negociation avec d'autres joueurs
         * Se deroule en plusieurs etapes :
         * Calcule les terrains qui l'interessent chez les adversaires
         * Penser a prendre les affinites en compte
         * @param callback : traitement a lancer a la fin des echanges
         * Il faut retenir les demandes rejetees pour proposer plus et ne pas demander a chaque tour
         */
        this.echangeProprietes = function (callback) {
			// Quand echange uniquement apres la vente de tous les terrains
			if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
				if(callback){
					callback();
				}
				return;
			}
			// Proprietes qui interessent le joueur
            var proprietes = this.findOthersInterestProprietes();
            if (proprietes.length == 0) {
                callback();
                return;
            }
            var nbGroupesPossedes = this.findGroupes().length;
            /* On calcule l'importance d'echanger (si des groupes sont presents ou non) */
            var interetEchange = Math.pow(1 / (1 + nbGroupesPossedes), 2);

            /* On cherche les monnaies d'echanges. */
            var proprietesFiltrees = [];
            for (var p in proprietes) {
                var prop = proprietes[p];
                var maison = prop.maison;
                // On verifie si une demande n'a pas ete faite trop recemment
                if (this._canAskTerrain(maison)) {
                    var last = this._getLastProposition(maison);
                    var joueur = maison.joueurPossede;
                    prop.compensation = 0;
					// Calcule les monnaies d'echange
                    prop.deals = maison.joueurPossede.findOthersInterestProprietes(this,proprietes);
                    if (prop.deals.length == 0) {
                        // On ajoute les terrains non importants (gare seule, compagnie)
                        var othersProprietes = this.findUnterestsProprietes();
                        var montant = 0;
                        if (othersProprietes != null && othersProprietes.proprietes != null && othersProprietes.proprietes.length > 0) {
                            // On en ajoute. En fonction de la strategie, on n'ajoute que les terrains seuls dans le groupe (peu important)
                            for (var i = 0; i < othersProprietes.proprietes.length && montant / maison.achat < 0.7; i++) {
                                var terrain = othersProprietes.proprietes[i];
                                // Il ne faut pas proposer un terrain du meme groupe que le terrain demande car pas forcement de la strategie
								// Deux terrains qui ne sont pas de la strategie sont potentiellement interessant a garder
                                if (!this.strategie.interetPropriete(terrain) && (terrain.groupe == null || !terrain.groupe.equals(maison.groupe))) {
                                    // On le refourgue
                                    prop.deals.push(terrain);
                                    montant += terrain.achat;
                                }
                            }
                        }
                        // Permettre calcul compensation quand traitement fournit des terrains < 80% du montant
                        if (montant / maison.achat < 0.8) {
                            prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last) - montant;
                        }
                    } else {
                        // Si trop couteux, on propose autre chose, comme de l'argent. On evalue le risque a echanger contre ce joueur.  
                        // On teste toutes les monnaies d'echanges
                        var monnaies = this.chooseMonnaiesEchange(prop, prop.monnaiesEchange, true, nbGroupesPossedes >= 2, last);
                        if (monnaies == null || monnaies.length == 0) {
                            prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last);
                            prop.deals = null;
                        } else {
                            prop.deals = monnaies;
                        }
                    }
                    // Si aucune proposition, on ajoute les autres terrains dont on se moque (terrains constructibles mais non intéressant)                        
                    if ((prop.deals == null || prop.deals.length == 0) && prop.compensation == 0) {
                        var terrains = this.findOthersProperties(proprietes);
                        var montant = 0;
                        for (var i = 0; i < terrains.length && montant / maison.achat < 0.7; i++) {
                            var terrain = terrains[i];
                            if (!this.strategie.interetPropriete(terrain)) {
                                if (prop.deals == null) {
                                    prop.deals = [];
                                }
                                // On le refourgue
                                prop.deals.push(terrain);
                                montant += terrain.achat;
                            }
                        }
                    }
                    if ((prop.deals != null && prop.deals.length > 0) || (prop.compensation != null && prop.compensation > 0)) {
                        proprietesFiltrees.push(prop);
                    }
                } else {
                    $.trigger('monopoly.debug', {
                        message: 'Le joueur ne demande pas ' + maison.nom
                    });
                }
            }
            // On choisit la propriete a demander en echange
            if (proprietesFiltrees.length != 0) {
                for (var idx in proprietesFiltrees) {
                    var p = proprietesFiltrees[idx];
                    var proposition = {
                        terrains: (p.deals == null) ? [] : p.deals,
                        compensation: p.compensation
                    };
                    try {
                        // L'action de fin d'un ordinateur
                        GestionEchange.init(this, p.maison.joueurPossede, p.maison, callback);
                        GestionEchange.propose(proposition);
                        return;
                    } catch (e) {
                        console.log(e);
                        // Deja en cours quelque part, on continue
                        callback();
                        return;
                    }
                }
            }
            // Aucun echange n'est fait, on continue
            callback();
        }

        /* Verifie que le terrain peut etre demande a l'echange (si une precedente demande n'a pas été faite trop recemment) */
        this._canAskTerrain = function (terrain) {
            // On prend le dernier
            var last = this._getLastProposition(terrain);
            if (last != null) {
                var pas = 3 + (Math.round((Math.random() * 1000) % 3));
                return last.nbTours + pas < nbTours;
            }

            return true;
        }

        this._getLastProposition = function (terrain) {
            if (this.rejectedPropositions != null && this.rejectedPropositions[terrain.id] != null) {
                return this.rejectedPropositions[terrain.id][this.rejectedPropositions[terrain.id].length - 1];
            }
            return null;
        }

        // La gestion des echanges se passe par des mecanismes asynchrones. On utilise un objet contenant une proposition / contre proposition et un statut.
        // On bloque le traitement d'un joueur

        /* Suite a une demande d'echange d'un joueur, analyse la requete. Plusieurs cas : 
         * Accepte la proposition (ACCEPT, indice > 3)
         * Refuse la proposition (BLOCK, indice < 0)
         * Fait une contre proposition en demandant plus d'argent et / ou d'autres terrains (UP, 1 < indice > 5)
         * Principe de l'algo : evalue les criteres pour obtenir un indicateur qui permet de repondre (bornes)
         * Gerer le cas de 2 ou il nous demande le terrain que l'on a (et qui nous interesse)
         */
        this.traiteRequeteEchange = function (joueur, maison, proposition) {
            // Si aucune compensation, on refuse
            if ((proposition.terrains == null || proposition.terrains.length == 0) && (proposition.compensation == null || proposition.compensation == 0)) {
                return GestionEchange.reject(this);
            }
            var others = this.findOthersInterestProprietes(joueur);
            var infos = this._calculatePropositionValue(maison, joueur, proposition, others);
            if (infos.critere >= 3) {
                return GestionEchange.accept(this);
            }
            if (infos.critere <= 0) {
                return GestionEchange.reject(this);
            }

            var contreProposition = {
                terrains: [],
                compensation: 0
            };
            var turn = 0; // Pas plus de 3 tour de calcul
            do {
                contreProposition = this._calculateContreProposition(joueur, proposition, contreProposition, infos.recommandations, maison, others);
                infos = this._calculatePropositionValue(maison, joueur, contreProposition, others);
            } while (infos.critere < 3 && turn++ < 3);

            if (infos.critere < 3) { // Impossible a generer
                return GestionEchange.reject(this);
            }
            return GestionEchange.contrePropose(contreProposition, this);
        }

        this._calculateContreProposition = function (joueur, proposition, contreProposition, recommandations, terrain, others) {
            if (recommandations["TERRAIN_DISPO"] == 1 || recommandations["TERRAIN_NON_LISTE"] == 1) {
                // terrain dispo non propose, on ajoute tant que la valeur du terrain n'est pas atteinte
                var montant = 0;
                for (var i = 0; i < others.length; i++) {
                    if (!others[i].maison.groupe.equals(terrain.groupe)) { // si on est interesse par le meme groupe
                        contreProposition.terrains.push(others[i].maison);
                        montant += others[i].maison.achat;
                        if (montant > terrain.achat) {
                            break;
                        }
                    }
                }
                /* Ajout d'un terrain de la propal originale */
                if (montant < terrain.achat && recommandations["TERRAIN_NON_LISTE"] == 1) {
                    // On ajoute un terrain propose avant
                    var done = false;
                    for (var i = 0; i < proposition.length && !done; i++) {
                        if (!contreProposition.terrains.contains(proposition.terrains[i])) {
                            contreProposition.terrains.push(proposition.terrains[i]);
                            done = true;
                        }
                        if (!done) {
                            // Il faut proposer autre chose, autre terrain
                            var uselessPropritetes = joueur.findUnterestsProprietes();
                            if (uselessProprietes.proprietes.length > 0) {
                                contreProposition.terrains.push(uselessProprietes.proprietes[0]);
                            }
                        }
                    }
                }
            }
            if (recommandations["ARGENT_INSUFFISANT"] == 1) {
                contreProposition.compensation += terrain.achat / 2;
            }
            return contreProposition;
        }

        /* Calcule la valeur d'une proposition d'echange */
        /* @return : renvoie la valeur de la proposition ainsi que des recommandations (utilise pour les contre propositions) */
        this._calculatePropositionValue = function (maison, joueur, proposition, others) {
            var recommandations = []; // Enregistre des parametres pour la contre proposition

            var interesetMeToo = false; // Indique qu'on est aussi interesse par ce groupe
            for (var i = 0; i < others.length; i++) {
                if (maison.groupe.equals(others[i].maison.groupe)) {
                    interesetMeToo = true;
                }
            }
            var critereTerrains = 0;
            var critereArgent = 0;
            // Gestion des terrains
            if ((proposition.terrains != null && proposition.terrains.length > 0)) {
                var useList = false;
                for (var t in proposition.terrains) {
                    var terrain = proposition.terrains[t];
                    // On verifie si dans others et on note l'ordre dans la liste, signe de l'interet
                    var interetTerrain = null;
                    for (var i = 0; i < others.length; i++) {
                        if (others[i].maison.equals(terrain)) {
                            interetTerrain = i;
                        }
                    }
                    // Si le terrain est dans la liste, on augmente le critere et prend en compte la position en plus value
                    if (interetTerrain != null) {
                        critereTerrains += 1 + (others.length - interetTerrain) / others.length;
                        useList = true;
                    }
                    // On ajoute une info sur le prix du terrain propose, constitue une valeur ajoutee
                    critereTerrains += terrain.achat / maison.achat;
                }
                if (!useList) {
                    recommandations["TERRAIN_NON_LISTE"] = 1;
                }
            } else {
                if (others != null && others.length > 0) {
                    // On verifie si le terrain demande n'appartient pas un groupe qui nous interesse
                    var length = others.length - ((interesetMeToo) ? 1 : 0);
                    critereTerrains -= length;
                    recommandations["TERRAIN_DISPO"] = 1; // Indique qu'un terrain peut etre choisi en contre proposition
                }
            }
            // Gestion de la compensation
            if (proposition.compensation != null) {
                critereArgent = proposition.compensation / maison.achat;
                /* On ajoute de l'importance si proposition superieur au fond propre */
                if (this.montant < proposition.compensation) {
                    critereArgent += Math.min(1.5, (proposition.compensation / this.montant) - 1);
                } else {
                    recommandations["ARGENT_INSUFFISANT"] = 1;
                }
            } else {
                recommandations["NO_ARGENT"] = 1;
            }

            /* Confirme le traitement ou le durci. Prend le pas sur la decision calculee  */
            var strategie = this.strategie.acceptSwapTerrain(maison, joueur, others, interesetMeToo);

            // On melange le tout
            var critere = (critereTerrains + critereArgent) * strategie;
            $.trigger('monopoly.debug',{message:"Criteres : " + critere + " " + critereTerrains + " " + critereArgent});
            return {
                critere: critere,
                recommandations: recommandations,
                others: others
            };

        }

        /* Traite la contre proposition qui peut se composer de terrain et / ou d'argent */
        /* A la fin, on a accepte ou pas. Plus d'aller retour. */
        /* Prendre en compte qu'on est a l'origine de la demande, un peu plus laxiste, en fonction du comportement */
        this.traiteContreProposition = function (proposition, joueur, maison) {
            if (proposition.terrains.length == 0 && proposition.compensation == 0) {
                return GestionEchange.reject(this);
            }
            /* On evalue la pertinence  */
            var others = this.findOthersInterestProprietes(joueur);
            var infos = null;
            if (proposition.terrains.length > 0) {
                // On inverse les parametres
                var prop = {
                    terrains: [maison],
                    compensation: proposition.compensation * -1
                };
                var terrain = proposition.terrains[0];
                var infos = this._calculatePropositionValue(terrain, joueur, prop, others);
            } else {
                // Uniquement de la tune
                // Il demande de l'argent, on verifie par rapport a nos resources
                infos = {
                    critere: 2
                };
            }
            // On peut etre un peu plus laxiste ?
            if (infos.critere > 3) {
                return GestionEchange.accept(this);
            }
            return GestionEchange.reject(this);
        }

        /* Si aucune monnaie d'echange ou si la monnaie d'echange est trop dangereuse, on evalue une compensation financiere
         * Plusieurs criteres sont pris en compte :
         * 1) Prix de base du terrain.
         * 2) Economie propre, il faut pouvoir acheter des maisons derriere (2 sur chaque terrain)
         * Renvoie des bornes min / max. On propose le min au debut
         * @param oldPropal : si non nulle, il existe une precedente proposition et on propose une compensation plus importante
         */
        this.evalueCompensation = function (joueur, maison, interetTerrain, oldProposition) {
            // On calcule les sommes dispos. En fonction de l'interet pour le terrain, on peut potentiellement hypothequer
            var budgetMax = this.comportement.getBudget(this, (interetTerrain != null && interetTerrain > 2));
            var budget = Math.min(budgetMax, maison.achat);
            if (oldProposition != null && oldProposition.proposition.compensation >= budget) {
                budget = Math.min(this.montant, oldProposition.proposition.compensation * this.comportement.getFactorForProposition());
                // On plafonne le budget (fonction logarithmique)
                var plafondBudget = (14 - Math.log(maison.achat)) * maison.achat;
                budget = Math.min(budget, plafondBudget);
            }
            return Math.round(Math.max(0, budget));
        }

        /* Evalue la dangerosite d'un joueur s'il recupere une maison supplementaire pour finir un groupe */
        /* Plusieurs criteres : 
         * 1) Capacite a acheter des constructions
         * 2) Rentabilite du groupe (hors frais d'achat, uniquement maison + loyer)
         * 3) Creation d'une ligne
         * Renvoie un nombre. Au dessus de 1, dangereux, en dessous, pas trop.
         */
        this.isDangerous = function (groupe) {
            // Critere 1, nombre de maison par terrain pouvant etre achete
            var nbMaison = (this.argent / groupe.maisons[0].prixMaison) / groupe.fiches.length;
            // compte les autres groupes
            var criterePrix = (groupe.maisons[0].loyers[nbMaison]) / 100000;
            // Ligne presente
            var groups = this.findGroupes();
            var isLigne = false;
            for (var g in groups) {
                if (groups[g].isVoisin(groupe)) {
                    isLigne = true;
                }
            }
            // Resultat : nb maison, le fait de faire une ligne et une ponderation par le prix
            var moteur = (nbMaison + criterePrix) * (isLigne ? 2 : 1);

            return moteur >= 5;
        }

        /* Choisis les terrains qu'il est possible de ceder en echange du terrain */
        /* Se base sur la dangerosite du terrain (n'est pas pris en compte) et sur la valeur des terrains par rapport a ce qui est demande */
        /* @param testDangerous : si le joueur est le seul fournisseur et qu'on a pas le choix, on prend le terrain*/
        /* @param strict : si strict est vrai, on ne relance pas l'algo en etant moins dangereux. Le joueur decide de ne pas faire de cadeau */
        /* @param oldProposition : derniere proposition refusee qui a ete faite, plus laxiste dans ce cas */
        this.chooseMonnaiesEchange = function (terrainVise, terrains, testDangerous, strict, oldProposition) {
            if (terrains == null || terrains.length == 0) {
                return [];
            }
            var proposition = [];
            var valeur = 0;
            // Si seul fournisseur, il faut etre plus laxiste.
            for (var t in terrains) {
                if (!terrainVise.joueurPossede.isDangerous(terrains[t].groupe) || !testDangerous) {
                    // On regarde si c'est necessaire de l'ajouter
                    if (valeur == 0) {
                        proposition.push(terrains[t]);
                        valeur += terrains[t].achat;
                    } else {
                        var rapport = (Math.abs(1 - terrainVise.achat / valeur)) / (Math.abs(1 - terrainVise.achat(valeur + terrains[t].achat)));
                        if (rapport > 1) {
                            proposition.push(terrains[t]);
                            valeur += terrains[t].achat;
                        }
                    }
                }
            }
            if (proposition.length == 0 && !strict && (testDangerous || oldProposition != null)) {
                // On relance sans etre strict
                return this.chooseMonnaiesEchange(terrainVise, terrains, joueur, false, strict);
            }
            return proposition;
        }

        this.initEnchere = function (transaction, terrain) {
            if (this.equals(terrain.joueurPossede)) {
                return;
            }
            // On calcule le budget max que le joueur peut depenser pour ce terrain
            if (this.currentEchange != null) {
                throw "Impossible de gerer une nouvelle enchere";
            }
            var interet = this.strategie.interetGlobal(terrain, this, true);
            var budgetMax = this.comportement.getMaxBudgetForStrategie(this, interet.interet);
			this.currentEnchere = {
                transaction: transaction,
                terrain: terrain,
                budgetMax: budgetMax,
				joueurInteresse:interet.joueur
            }
        }

        this.updateInfoEnchere = function (montant, lastEncherisseur) {}

        this.updateEnchere = function (transaction, jeton, montant, lastEncherisseur) {
            if (transaction != this.currentEnchere.transaction) {
                return;
            }
            // Le joueur a l'enchere courante la plus haute
            if (this.equals(lastEncherisseur)) {
                return;
            }
            // On temporise la reponse de IA_TIMEOUT + random de ms
            var timeout = IA_TIMEOUT * (Math.random() + 1);
            var joueur = this;
            setTimeout(function () {
				if(joueur.currentEnchere == null){return;}
                if (montant > joueur.currentEnchere.budgetMax || 
				(joueur.currentEnchere.joueurInteresse!=null && !joueur.currentEnchere.joueurInteresse.equals(lastEncherisseur))) {
                    // Exit enchere
                    GestionEnchere.exitEnchere(joueur);
                } else {
                    // Fait une enchere. Dans le cas d'un blocage, joueurInteresse est renseigne. Enchere uniquement s'il est le dernier
                    try {
                        GestionEnchere.doEnchere(joueur, montant, jeton);
                    } catch (e) {
                        // Si une enchere a deja ete faite et update, on arrete la demande (joueur trop lent)
                    }
                }
            },timeout);
        }

        this.notifyExitEnchere = function (joueurs) {}

        /* Comportement lorsque l'enchere est terminee */
        this.endEnchere = function () {
            this.currentEnchere = null;
            GestionEnchere.checkEndNotify(this);
        }

        /* Fonction doBlocage a developpe permettant de faire du blocage de construction : vente d'un hotel pour limiter l'achat de maison, decision d'acheter un hotel pour bloquer.
         * Se base sur les terrains constructibles des adversaires ainsi que de leur tresorie.
         * Retourne vrai s'il faut bloquer le jeu de constructions
         */
        this.doBlocage = function () {
            // On compte le nombre joueurs qui peuvent construire
            for (var index in joueurs) {
                var joueur = joueurs[index];
                if (!this.equals(this)) {
                    var groups =
                        joueur.findGroupes();
                    if (groups.size() > 0) {
                        // On verifie si le budget est important ()
                        // On compte le potentiel de maison achetables
                        var nbMaisons = 0;
                        var coutMaisons = 0;
                        for (var color in groups) {
                            var group = groups[color];
                            count += group.proprietes.length;
                            for (var index in group.proprietes) {
                                var maison = group.proprietes[index];
                                nbMaisons += 5 - maison.nbMaison;
                                coutMaisons += (5 - maison.nbMaison) * maison.prixMaison;
                            }
                        }
                        var budgetMin = (coutMaisons / nbMaisons) * 3;
                        if (nbMaisons > 3 && budgetMin < joueur.montant) {
                            // On doit bloquer la construction
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        /* Override de la methode pere */
        this.resolveProblemeArgent = function (montant, callback) {
            $.trigger('monopoly.debug', {
                message: 'Resoud probleme argent'
            });
            var joueur = this;

            /* Ordre de liquidations :
             * 1) Terrains non constructibles, terrains non groupes, terrains groupes non construits
             * 2) Vente des maisons les maisons / hotels les mains rentables prochainement (base sur les stats des prochains passages)
             * 3) Hypotheque des terrains precedemment construits
             **/

            /* CAS 1 */
            var maisons = [];
            for (var index in this.maisons) {
                var maison = this.maisons[index];
                // On prend les terrains non hypotheques et non construits
                if (maison.statutHypotheque == false && !maison.isGroupeeAndBuild()) {
                    maisons.push(maison);
                }
            }

            var findInfo = function (maison) {
                switch (maison.type) {
                case "gare":
                    return -1;
                    break;
                case "compagnie":
                    return -2;
                    break;
                default:
                    return (maison.constructible) ? maison.groupe.getInfos(joueur) : 0;
                }
            }
            maisons.sort(function (a, b) {
                var infosA = findInfo(a);
                var infosB = findInfo(b);

                return infosA - infosB;
            });

            $.trigger("monopoly.debug", {
                message: "PHASE 1"
            });
            for (var index = 0; index < maisons.length && this.montant < montant; index++) {
                var maison = maisons[index];
                maison.hypotheque();
            }

            /* CAS 2 */
            if (this.montant < montant) {
                $.trigger("monopoly.debug", {
                    message: "PHASE 2"
                });
                // 3 Terrains construits, on vend les maisons dessus
                // On recupere les groupes construits classes par ordre inverse d'importance. On applique la meme regle que la construction tant que les sommes ne sont pas recupereres
                var sortedGroups = [];
                try {
                    sortedGroups = this.getGroupsToConstruct("ASC", 0.1);
                } catch (e) {}
                // On boucle (tant que les sommes ne sont pas recouvres) sur le groupe pour reduire le nombre de maison, on tourne sur les maisons
                var run = true;
                for (var idGroup in sortedGroups) {
                    var group = sortedGroups[idGroup];
                    // On boucle pour reduire les maisons au fur et a mesure
                    var proprietes = group.proprietes;
                    // On trie par nombre de maison
                    proprietes.sort(function (a, b) {
                        if (a.nbMaison == b.nbMaison) {
                            return 0;
                        }
                        return a.nbMaison < b.nbMaison ? 1 : -1;
                    });
                    var currentId = 0;
                    var nbNoHouse = 0;
                    var boucle = 0; // Securite pour eviter boucle infinie
                    var maisonVendues = 0;
                    while (this.montant < montant && nbNoHouse < proprietes.length && boucle++ < 100) {
                        var p = proprietes[currentId];
                        if (p.nbMaison == 0) {
                            nbNoHouse++;
                        } else {
                            if (p.sellMaison(this)) {
                                maisonVendues++;
                                this.gagner(p.prixMaison / 2, true);
                            }
                        }
                        currentId = (currentId + 1) % proprietes.length;
                    }
                    if (this.montant > montant) {
                        if (maisonVendues > 0) {
                            $.trigger('monopoly.vendMaison', {
                                joueur: this,
                                nbMaison: maisonVendues
                            });
                        }
                        $.trigger('refreshPlateau');
                        break;
                    }
                }
            }
            /* CAS 3, il reste les maisons groupees desormais non construites */
            if (this.montant < montant) {
                var maisons = [];
                for (var index in this.maisons) {
                    var maison = this.maisons[index];
                    // On prend les terrains non hypotheques
                    if (maison.statutHypotheque == false) {
                        maisons.push(maison);
                    }
                }
                // On trie par montant (moins cher en premier). A deporter dans la strategie
                maisons.sort(function (a, b) {
                    return a.achat - b.achat;
                });
                for (var index = 0; index < maisons.length && this.montant < montant; index++) {
                    var maison = maisons[index];
                    maison.hypotheque();
                }
                if (this.montant < montant) {
                    // Cas impossible car verification des fonds fait avant
                    this.doDefaite();
                    if (callback) {
                        callback();
                    }
                }
            }
            // Somme recouvree
            this.setArgent(this.montant - montant); // Paiement de la dette
            this.bloque = false;
            if (callback) {
                callback();
            }
            return true;
        }

        this.getNbGroupConstructibles = function () {
            var nb = 0;
            var tempGroup = [];
            for (var idx in this.maisons) {
                var maison = this.maisons[idx];
                if (maison.isGroupee() && tempGroup[maison.groupe.nom] == null) {
                    nb++;
                    tempGroup[maison.groupe.nom] = 1;
                }

            }
            return nb;
        }

        /* Renvoie la liste des groupes a construire trie. 
         * @param sortType : Tri des groupes en fonction de l'importance. ASC ou DESC
         */
        this.getGroupsToConstruct = function (sortType, level) {
            var groups = this.findGroupes(); // structure : [color:{color,proprietes:[]}]
            // Pas de terrains constructibles
            if (groups.size() == 0) {
                throw "Impossible";
            }
            // On determine les terrains les plus rentables a court terme (selon la position des joueurs)
            var maisons = this.comportement.getNextProprietesVisitees(this, level);
            // On Calcule pour chaque maison des groupes (meme ceux sans interet) plusieurs indicateurs : proba (pondere a 3), la rentabilite (pondere a 1)
            var totalMaisons = 0; // Nombre total de proprietes constructibles
            for (var color in groups) {
                var group = groups[color];
                group.proba = 0;
                group.rentabilite = 0;
                group.lessThree = 0;
                group.interetGlobal = 0;
                for (var index in group.proprietes) {
                    var propriete = group.proprietes[index];
                    totalMaisons++;
                    // On cherche si proba
                    if (maisons[propriete.id] != null) {
                        group.proba += maisons[propriete.id].proba * 3;
                    }
                    group.rentabilite += propriete.getRentabilite();
                    group.lessThree += (propriete.nbMaison <= 3) ? 0.5 : 0;
                }
            }
            // On trie les groupes
            var sortedGroups = [];
            for (var color in groups) {
                var group = groups[color];
                group.interetGlobal = group.proba + group.rentabilite + ((group.lessThree > 0) ? 0.5 : 0);
                sortedGroups.push(group);
            }
            var GREATER_VALUE = (sortType == "ASC") ? 1 : -1;
            var LESSER_VALUE = (sortType == "ASC") ? -1 : 1;

            sortedGroups.sort(function (a, b) {
                if (a.interetGlobal == b.interetGlobal) {
                    return 0;
                }
                if (a.interetGlobal > b.interetGlobal) {
                    return GREATER_VALUE;
                }
                return LESSER_VALUE;
            });
            return sortedGroups;
        }

        /* Renvoie les groupes construits */
        /* @param nbMaison : nombre de maison moyen qui servent de palier */
        this.hasConstructedGroups = function (nbMaison) {
            var nb = nbMaison || 0;
            var groups = this.findGroupes();
            for (var idGroup in groups) {
                if (groups[idGroup].group.getAverageConstructions() > nb) {
                    return true;
                }
            }
            return false;
        }

        /* Rachete les hypotheques */
        /* Cas : groupes presents (1) et construits (nb>3). Liquidite > 7 fois prix hypotheque */
        this.rebuyHypotheque = function () {
            // Hypotheque presentes
            var terrains = this.findMaisonsHypothequees();
            if (terrains == null || terrains.length == 0 && (this.getNbGroupConstructibles() > 0 && !this.hasConstructedGroups(3))) {
                return;
            }
            var pos = 0;
            while (pos < terrains.length && this.montant > 7 * terrains[pos].achatHypotheque) {
                terrains[pos++].leveHypotheque();
            }
        }

        /* Construit des maisons / hotels 
         * Calcul les groupes constructibles, verifie l'argent disponible. Construit sur les proprietes ou peuvent tomber les adversaires (base sur leur position et les stats au des)
         * Possibilite d'enregistrer tous les deplacements des joueurs pour affiner les cases les plus visitees
         */
        this.buildConstructions = function () {
            var budget = this.comportement.getBudget(this);
            // Pas d'argent
            if (budget < 5000) {
                return;
            }
            var sortedGroups = [];
            try {
                sortedGroups = this.getGroupsToConstruct("DESC", 0.1);
                // On tri les maisons de chaque groupe en fonction du prix et du nombre (le moins de maison en premier puis l'achat le plus eleve
                for (var idGroup in sortedGroups) {
                    sortedGroups[idGroup].proprietes.sort(function (a, b) {
                        if (a.nbMaison == b.nbMaison) {
                            if (a.achat == b.achat) {
                                return 0;
                            }
                            return a.achat < b.achat ? 1 : -1
                        }
                        return a.nbMaison > b.nbMaison ? 1 : -1;
                    });
                }
            } catch (e) {
                // Pas de terrains constructibles
                return;
            }

            /* Plusieurs regles pour gerer les constructions : 
             * Si un seul groupe, on construit notre budget dessus
             * Si plusieurs groupes avec des taux equivalent, on construit sur le groupe le plus rentable (basé sur stats et sur cout)
             * On construit jusqu'a obtenir 3 maisons partout (seuil de rentabilité). On construit ensuite sur l'autre groupe
             * On construit toujours plus sur la maison la plus chere
             * S'il reste du budget, on recupere les terrains sans interet et on construit dessus
             * On calcule la somme des taux par groupe
             */


            // On construit des maisons. On s'arrete quand plus de budget ou qu'on ne peut plus construire (hotel partout ou 4 maisons (blocage de constructions))
            var stopConstruct = false;
            var currentMaison = 0;
            var currentGroup = 0;
            var seuil = 3; // Premier passage, ensuite passe a 4 ou 5
            var achats = {
                maison: 0,
                hotel: 0,
				terrains:[]
            };
            while (budget >= 5000 && !stopConstruct) {
                // On choisit une maison
                var group = sortedGroups[currentGroup];
                // Changement de group
                var maison = group.proprietes[currentMaison];
                // Si le seuil est atteint, on construit sur une autre maison ou sur un autre group
                if (maison.nbMaison >= seuil) {
                    if (group.treat == null) {
                        group.treat = 1;
                    } else {
                        group.treat++;
                    }
                    // Le goupe est traite, on passe au suivant
                    if (group.treat == group.proprietes.length) {
                        currentGroup++;
                        currentMaison = 0;
                        // Soit on a fait le tour, on recommence en changeant le seuil
                        if (currentGroup >= sortedGroups.length) {
                            if (seuil == 3) {
                                seuil = 5;
                                for (var color in sortedGroups) {
                                    sortedGroups[color].treat = 0;
                                }
                                currentGroup = 0;
                            } else {
                                // Fin du traitement
                                stopConstruct = true;
                            }
                        }
                    } else {
                        // Maison suivante dans le groupe
                        currentMaison = (currentMaison + 1) % group.proprietes.length;
                    }
                } else {
                    // On construit
                    try {
                        maison.buyMaison(this, true);
                        budget -= maison.prixMaison;
                        this.payer(maison.prixMaison);
						if (maison.nbMaison == 4) { //hotel
                            achats.hotel++;
                        } else {
                            achats.maison++;
                        }
						achats.terrains[group.proprietes[currentMaison].id] = group.proprietes[currentMaison];                        
                        currentMaison = (currentMaison + 1) % group.proprietes.length;
                    } catch (e) {
                        // Plus de maison ou d'hotel (on peut potentiellement continuer en achetant des maisons ?)                  
                        stopConstruct = true;
                    }

                }
            }
            $.trigger('monopoly.acheteConstructions', {
                joueur: this,
                achats: achats
            });
            $('body').trigger('refreshPlateau');
        }


        /* Reevalue la strategie. Se base sur plusieurs parametres :
         * Si peu de propriete ont ete achetees (<3)
         * Si 60% des terrains qui l'interessent ont ete vendu
         * Si aucune famille n'est completable (dans la strategie choisie)
		 * Si on possede deux terrains d'une strategie qui n'est pas la notre, on choisi cette strategie
         */
        this.changeStrategie = function () {
            var stats = this.strategie.getStatsProprietes();
            if (stats.color.pourcent < 40 && this.countInterestProperties() <= 2 && !this.isFamilyFree()) {
                $.trigger("monopoly.debug", {
                    message: this.nom + " cherche une nouvelle strategie"
                });
                // On change de strategie. Une nouvelle strategie doit posseder au moins 60% de ses terrains de libre
                for (var i in strategies) {
                    var s = new strategies[i]();
                    if (s.name != this.strategie.name) {
                        var strategieStats = s.getStatsProprietes();
                        if (strategieStats.color.pourcent > 50) {
                            // Nouvelle strategie
                            $.trigger("monopoly.debug", {
                                message: this.nom + " change de stratégie : " + this.strategie.name + " => " + s.name
                            });
                            this.strategie = s;
                            return;
                        }
                    }
                }
                // On garde la meme si aucune n'est interessante
            }
        }
       
        /* Compte le nombre de maison possedee correspondant a la strategie */
        this.countInterestProperties = function () {
            var count = 0;
            for (var i = 0; i < this.maisons.length; i++) {
                if (this.strategie.groups.contains(this.maisons[i].color)) {
                    count++;
                }
            }
            return count;
        }

        /* Indique s'il existe des familles que je peux encore posseder sans echange
         * Se base sur les maisons possedees et non celle de la strategie =>TODO
         */
        this.isFamilyFree = function () {
            // On parcourt les terrains et on verifie la dispo des terrains
            var family = new Array();
            for (var m in this.maisons) {
                var maison = this.maisons[m];
                if (!family[maison.groupe.nom]) {
                    family[maison.groupe.nom] = true;
                    var free = true;
                    for (var idf in maison.groupe.fiches) {
                        var fiche = maison.groupe.fiches[idf];
                        if (fiche.statut != ETAT_LIBRE && !this.equals(fiche.joueurPossede)) {
                            free = false;
                        }
                    }
                    if (free) {
                        return true;
                    }
                }
            }
            return false;
        }


        /* Fonction appelee avant que les des ne soit lances, lorsqu'il est en prison */
        /* Regle : si on est au debut du jeu, on sort de prison pour acheter des terrains. 
         * Si on est en cours de jeu et que le terrain commence a etre miné, on reste en prison */
        this.actionAvantDesPrison = function (buttons) {
            var _self = this;
            setTimeout(function () {
                // Cas 1 : on prend la carte de sortie
                var getOut = _self.getOutPrison();
                if (getOut) {
                    if (buttons["Utiliser carte"] != null) {
                        buttons["Utiliser carte"]();
                    } else {
                        buttons["Payer"]();
                    }
                } else {
                    buttons["Attendre"]();
                }
            }, IA_TIMEOUT);
        }

        /* On sort de prison prison dans les cas suivants 
         * 1) Le joueur a moins de deux groupes et le terrain n'est pas mine (moyenne des loyers < 20% de ses moyens) avec au moins 3 terrains de vendu
         * 2) Si le terrain est miné (moyenne < 30% des moyens) mais que le joueur a absolument besoin d'un terrain encore libre pour termine son groupe (pas de groupe)
         * 3) On sort de prison pour acheter en debut de jeu
         * Corolaire, on reste en prison
         * 1) Si le joueur a au moins deux groupes
         * 2) Si le terrain est miné > 15% et qu'il n'a pas un terrain a recuperer absoluement
         * 3) Si le terrain est très miné > 30%, quelque soit sa recherche de terrain
         */
        this.getOutPrison = function () {
            var loyerStat = this.comportement.getLoyerMoyen(this);
            var groupesPossibles = this.getGroupesPossibles();
            // On peut augmenter le risque si les terrains rouges et oranges sont blindes (sortie de prison)
            // depend de l'argent dispo et du besoin d'acheter un terrain (libre et indispensable pour finir le groupe)
            // Cas pour rester en prison    
            if (this.findGroupes().size() >= 2) {
                return false;
            }
            if (groupesPossibles.length > 0 && loyerStat.montant < (this.montant * 0.3)) {
                return true;
            }
            if (loyerStat.nb >= 4 && loyerStat.montant > (this.montant * 0.15)) {
                return false;
            }
            return true;
        }

        // decide si achete ou non la maison
        // On se base sur la politique, les fiches obtenues par les autres
        this.gererAchat = function (boutonAchat) {
            boutonAchat.click();
        }

        this.init();
    }

    /* Represente un joueur */

    function Joueur(numero, nom, color) {
        this.numero = numero;
        this.id = numero;
        this.nom = nom || '';
        this.color = color;
        this.montant = 150000;
        this.maisons = new Array();
        this.enPrison = false;
        this.pion = null;
        this.nbDouble = 0;	// Nombre de tour en prison
        this.bloque = false; // Indique que le joueur est bloque. Il doit se debloquer pour que le jeu continue
        this.defaite = false;
		this.tourDefaite = null;
        this.cartesSortiePrison = []; // Cartes sortie de prison
        this.canPlay = true;
        this.equals = function (joueur) {
            if (joueur == null) {
                return false;
            }
            return this.numero == joueur.numero;
        }

        /* Sauvegarde un joueur */
        this.save = function () {
            // On sauvegarde id, nom, color,montant, prison, bloque, defaite, cartes, son type (manuel). Pas besoin des maisons (auto)
            var data = {
                canPlay: this.canPlay,
                id: this.id,
                nom: this.nom,
                color: this.color,
                montant: this.montant,
                enPrison: this.enPrison,
                bloque: this.bloque,
                defaite: this.defaite,
                cartesPrison: this.cartesSortiePrison.length,
                position: this.pion.position,
                etat: this.pion.etat
            };
            this.saveMore(data);
            return data;
        }

        this.load = function (data) {
            for (var name in data) {
                if (this[name] != null) {
                    this[name] = data[name];
                }
            }
            this.setArgent(this.montant);            
            this.loadMore(data);
            // Position initiale, aucune action
            this.pion.goDirectToCell(data.etat, data.position);
            // Cas des cartes de prison
        }

        /* Template Method : les enfants peuvent la reimplementer */
        this.saveMore = function () {}

        this.loadMore = function (data) {}

        // Utilise la carte sortie de prison
        this.utiliseCarteSortiePrison = function () {
            if (this.cartesSortiePrison.length == 0) {
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
        this.getStats = function () {
            var stats = {
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
            for (var index in this.maisons) {
                var maison = this.maisons[index];
                stats.hotel += parseInt(maison.hotel == true ? 1 : 0);
                stats.maison += parseInt(maison.hotel == false ? maison.nbMaison : 0);
                // Revente des constructions + hypotheque
                stats.argentDispo += (maison.statutHypotheque) ? 0 : (((maison.constructible) ? (maison.nbMaison * (maison.prixMaison / 2)) : 0) + maison.achat / 2);
                // Revente uniquement des terrains non groupes
                stats.argentDispoHypo += (!maison.isGroupee() && !maison.statutHypotheque) ? maison.achat / 2 : 0; // hypotheque des terrains non groupes
            }
            return stats;
        }

        /* Selectionne le joueur */
        this.select = function () {
            if (this.div) {
                this.div.find('div:first').addClass('joueurCourant');
            }
            if (!this.enPrison) {
                this.nbDouble = 0;
            }
            this.joue();
        }

        this.getPosition = function () {
            return {
                pos: this.pion.pos,
                etat: this.pion.etat
            };
        }

        /* Affiche la demande d'echange d'un joueur */
        this.traiteRequeteEchange = function (joueur, terrain, proposition) {
            // On affiche l'interface au joueur
            CommunicationDisplayer.show(joueur, this, terrain, proposition, this);
        }

        /* Affiche la contreproposition du joueur */
        this.traiteContreProposition = function (proposition, joueur, terrain) {
            CommunicationDisplayer.showContreProposition(proposition);
        }

        /* On affiche a l'utilisateur l'acceptation de la proposition */
        this.notifyAcceptProposition = function (callback) {
            // On affiche l'information
            CommunicationDisplayer.showAccept(callback);
        }

        /* On affiche a l'utilisateur le rejet de la proposition */
        this.notifyRejectProposition = function (callback) {
            CommunicationDisplayer.showReject(callback);
        }

        /* Initialise une mise aux encheres */
        /* @param transaction : numero de transaction pour communiquer */
        this.initEnchere = function (transaction, terrain) {
            GestionEnchereDisplayer.display(terrain, this);
        }

        /* Met a jour la derniere enchere qui a été faite (pour suivre l'avancement) quand le joueur ne participe plus */
        this.updateInfoEnchere = function (montant, lastEncherisseur) {
            GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, false);
        }

        /* Notifie lorsqu'un joueur quitte les encheres */
        this.notifyExitEnchere = function (joueur) {
            GestionEnchereDisplayer.showJoueurExit(joueur);
        }

        this.updateEnchere = function (transaction, jeton, montant, lastEncherisseur,isNewEnchere) {
            if(isNewEnchere){
				GestionEnchereDisplayer.clean();
			}
			GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, true, {
                transaction: transaction,
                jeton: jeton
            });
        }

        this.endEnchere = function (montant, joueur) {
            GestionEnchereDisplayer.displayCloseOption(montant, joueur);
        }

        /* Renvoie les maisons du joueur regroupes par groupe */
        this.getMaisonsGrouped = function () {
            var groups = [];
            for (var m in this.maisons) {
                var maison = this.maisons[m];
                if (maison.groupe == null) {
                    if (groups["others"] == null) {
                        groups["others"] = {
                            groupe: 'Autres',
                            color: 'black',
                            terrains: [maison]
                        };
                    } else {
                        groups["others"].terrains.push(maison);
                    }
                } else {
                    if (groups[maison.groupe.nom] == null) {
                        groups[maison.groupe.nom] = {
                            groupe: maison.groupe.nom,
                            color: maison.groupe.color,
                            terrains: [maison]
                        };
                    } else {
                        groups[maison.groupe.nom].terrains.push(maison);
                    }
                }
            }
            return groups;
        }

        /**
         * Renvoie la liste des groupes presque complet (un terrain manquant) pour lequel le terrain est encore libre
         */
        this.getGroupesPossibles = function () {
            var groups = [];
            for (var index in this.maisons) {
                var maison = this.maisons[index];
                if (!maison.isGroupee()) {
                    // calcule les terrains libre de la meme couleurs
                    var stat = {
                        libre: 0,
                        adversaire: 0
                    };
                    for (var id in maison.groupe.fiches) {
                        var f = maison.groupe.fiches[id];
                        if (!this.equals(f.joueurPossede)) {
                            if (f.statut == ETAT_LIBRE) {
                                stat.libre++;
                            } else {
                                stat.adversaire++;
                            }
                        }
                    }
                    if (stat.libre == 1 && stat.adversaire == 0) {
                        groups.push(maison.color);
                    }
                }
            }
            return groups;
        }

        // Cherche la position ou placer la nouvelle fiche (tri par couleur)
        this.cherchePlacement = function (maison) {
            for (var i = 0; i < this.maisons.length; i++) {
                if (this.maisons[i].color == maison.color) {
                    return this.maisons[i].input;
                }
            }
            return null;
        }

        this.joueDes = function (sommeDes) {
		    var nextCase = this.pion.deplaceValeursDes(sommeDes);
            this.pion.goto(nextCase.axe, nextCase.pos, doActions);
        }

        // Fonction a ne pas implementer avec un vrai joueur
        this.joue = function () {}

        // Fonction a ne pas implementer avec un vrai joueur
        this.actionApresDes = function (buttons, propriete) {}

        // Fonction a ne pas implementer pour un vrai joueur
        this.actionAvantDesPrison = function (buttons) {}

        // Achete une propriete
		/* @param montant : montant a payer si different du prix d'achat (cas des encheres) */
        this.acheteMaison = function (maison,montant) {
			montant = montant || maison.achat;
            // On verifie l'argent
            if (maison == null || montant > this.montant) {
			    throw "Achat de la maison impossible";
            }
            if (maison.isLibre()) {
                this._drawTitrePropriete(maison);
                maison.vendu(this);
                this.payer(montant);
            }
        }

        /* Refuse l'achat d'une propriete. La banque peut mettre aux encheres le terrain */
		this.refuseMaison = function(maison,callback){
			$.trigger('monopoly.visiteMaison',{joueur:joueurCourant,maison:maison});
			if(VARIANTES.enchereAchat){
				this._enchereByBanque(maison,callback);
			}else{
				if(callback){
					callback();
				}
			}
		}
		
		this._enchereByBanque = function(maison,callback){
			GestionEnchere.init(maison, maison.achat, true, callback);
		}

        this._drawTitrePropriete = function (maison) {
            var m = this.cherchePlacement(maison);
            var input = '<input type=\"button\" id=\"idInputFiche' + maison.id + '\" class=\"ui-corner-all fiche color_' + maison.color.substring(1) + '\" value=\"' + maison.nom + '\" id=\"fiche_' + maison.id + '\"/>';
            if (m != null) {
                m.after(input);
            } else {
                this.div.append(input);
            }
            maison.input = $('#idInputFiche' + maison.id);
            maison.input.click(function () {
                openDetailFiche(GestionFiche.getById(maison.id), $(this));
            });
        }

        /* Permet de deplacer le terrain sur le joueur lors d'un echange */
        this.getSwapProperiete = function (maison) {
            var m = this.cherchePlacement(maison);
            if (m != null) {
                m.after(maison.input);
            } else {
                this.div.append(maison.input);
            }
            // On supprime l'ancien proprio
            if(maison.joueurPossede){
                maison.joueurPossede.removeMaison(maison);
            }
            maison.joueurPossede = this;
            this.maisons.push(maison);
        }

        /* Supprime la maison de la liste */
        this.removeMaison = function (maison) {
            for (var i = 0; i < this.maisons.length; i++) {
                if (this.maisons[i].equals(maison)) {
                    this.maisons.splice(i, 1);
                    return;
                }
            }
        }

        // Envoi le joueur (et le pion) en prison
        this.goPrison = function () {
            this.enPrison = true;
            this.div.addClass('jail');
            this.nbDouble = 0;
            this.pion.goPrison(changeJoueur);
            $.trigger("monopoly.goPrison", {
                joueur: this
            });
        }

        this.exitPrison = function () {
            this.enPrison = false;
            this.nbDouble = 0;
            this.div.removeClass('jail');
            $.trigger("monopoly.exitPrison", {
                joueur: this
            });
        }

        this.isEnPrison = function () {
            return this.enPrison;
        }

        this.setDiv = function (div) {
            this.div = div;
            this.setArgent(this.montant);
        }

        this.setArgent = function (montant) {
            this.montant = montant;
            $('.compte-banque', this.div).text(montant);
        }

        this.payerParcGratuit = function (montant, callback) {
            this.payer(montant, function () {
                if (VARIANTES.parcGratuit) {
                    try{
						parcGratuit.payer(montant);
					}catch(insolvable){}
                }
                if (callback) {
                    callback();
                }
            });
        }

        this.setPion = function (color) {
            this.pion = new Pion(color, this);
        }

        /* Verifie si le joueur peut payer ses dettes */
        this.isSolvable = function (montant) {
            return this.getStats().argentDispo >= montant;
        }

        /* Paye la somme demandee. Si les fonds ne sont pas disponibles, l'utilisateur doit d'abord réunir la somme, on le bloque */
        /* @param callback : action a effectuer apres le paiement */
        this.payer = function (montant, callback) {
            // On verifie si c'est possible de recuperer les sommes
            if (this.getStats().argentDispo < montant) {
                // Banqueroute, le joueur perd
                this.doDefaite();
                throw "Le joueur " + this.nom + " est insolvable";
            }

            /* Verifie si le joueur peut payer */
            if (montant > this.montant) {
                this.bloque = true;
                var _self = this;
                this.resolveProblemeArgent(montant, callback);
            } else {
                this.setArgent(this.montant - montant);
                if (callback) {
                    callback();
                }
            }
        }

        /* Paye une somme a un joueur */
        /* Si le joueur ne peut pas payer, une exception est lancee (il a perdu). On recupere le peut d'argent a prendre */
        /* Payer est potentiellement asynchrone (resolve manuel), on indique l'etape suivante en cas de reussite */
        this.payerTo = function (montant, joueur) {
            try {
                this.payer(montant, function () {
                    joueur.gagner(montant);
                    changeJoueur();
                });
            } catch (insolvable) {
                // Le joueur n'est pas solvable, on se sert sur le reste
                if (joueur != null) { // Pb quand amende ?
                    joueur.gagner(this.getStats().argentDispo);
                }
                changeJoueur();
            }
        }

        this.gagner = function (montant) {
            this.setArgent(this.montant + montant);
        }

        /* Gestion de la defaite */
        this.doDefaite = function () {
            // On laisse juste le nom et on supprime le reste, on supprime le pion, on remet les maison a la vente
            // Le banquier peut mettre aux encheres les terrains
            for (var f in this.maisons) {
                this.maisons[f].libere();
            }
            $.trigger('refreshPlateau'); // Pour supprimer les terrains
            this.maisons = [];
            $('input', this.div).remove();
            this.pion.remove();
            // On affiche un style sur la liste
            $('.joueurCourant', this.div).removeAttr('style').addClass('defaite');
            this.setArgent(0);
            this.defaite = true;
			this.tourDefaite = nbTours;
            $.trigger("monopoly.defaite", {
                joueur: this
            });
        }

        /* Resoud les problemes d'argent du joueur */
        /* @param montant : argent a recouvrer */
        /* @param joueur : beneficiaire */
        this.resolveProblemeArgent = function (montant, callback) {
            // On ouvre le panneau de resolution en empechant la fermeture
            this.montant -= montant;
            var button = createMessage("Attention", "red", "Vous n'avez pas les fonds necessaires, il faut trouver de l'argent", function () {
                // On attache un evenement a la fermeture
                var onclose = function (e) {
                    if (joueurCourant.montant < 0) {
                        // Message d'erreur pas possible
                        createMessage("Attention", "red", "Impossible, il faut trouver les fonds avant de fermer");
                        e.preventDefault();
                    } else {
                        joueurCourant.bloque = false;
                        joueurCourant.setArgent(joueurCourant.montant);
                        if (callback) {
                            callback();
                        }
                    }
                }
                GestionTerrains.open(true, onclose);
            });
            return true;
        }

        this.getFichePosition = function () {
            return GestionFiche.getById(this.pion.etat + "-" + this.pion.position);
        }

        /** Renvoie la liste des terrains hypothecables : sans construction sur le terrain et ceux de la famille, pas deja hypotheques
         * @return : la liste des terrains */
        this.findMaisonsHypothecables = function () {
            var proprietes = [];
            for (var i = 0; i < this.maisons.length; i++) {
                var propriete = this.maisons[i];
                if (propriete.statutHypotheque == false && propriete.nbMaison == 0) {
                    // Aucune propriete possedee de la couleur ne doit avoir de maison
                    var flag = true;
                    for (var j = 0; j < this.maisons.length; j++) {
                        if (this.maisons[j].color == propriete.color && this.maisons[j].nbMaison > 0) {
                            flag = false;
                        }
                    }
                    if (flag) {
                        proprietes.push(propriete);
                    }
                }
            }
            return proprietes;
        }

        /* Renvoie la liste des maisons hypothequees */
        this.findMaisonsHypothequees = function () {
            var proprietes = [];
            for (var i = 0; i < this.maisons.length; i++) {
                if (this.maisons[i].statutHypotheque == true) {
                    proprietes.push(this.maisons[i]);
                }
            }
            return proprietes;
        }

        /*
        /**
         * Renvoie la liste des groupes constructibles du joueur
         * @returns {Array}
         */
        this.findGroupes = function () {
            var colorsOK = new Array();
            var colorsKO = new Array();
            var groups = [];

            for (var i = 0; i < this.maisons.length; i++) {
                var m = this.maisons[i];
                if (m.constructible == true && m.groupe != null) {
                    // Deja traite, on possede la famille
                    if (colorsOK[m.color] == true) {
                        //groups[m.color].proprietes.push(m);
                    } else {
                        if (colorsKO[m.color] == null) {
                            // On recherche si on a toutes les proprietes du groupe
                            //var ok = true;
                            var infos = m.groupe.getInfos(this);
                            // Possede le groupe
                            if (infos.free == 0 && infos.adversaire == 0 && infos.hypotheque == 0) {
                                colorsOK[m.color] = true;
                                groups[m.color] = {
                                    color: m.color,
                                    group: m.groupe,
                                    proprietes: m.groupe.fiches
                                };
                            } else {
                                colorsKO[m.color] = true;
                            }
                        }
                    }
                }
            }
            return groups;
        }

        /* Cherche les terrains qui interesse chez les adversaires */
        /* Les terrains sont tries par interet.
         * Les criteres : la rentabilite, le nombre de terrain a acheter (1 ou 2), le fait de faire une ligne avec un groupe possede */
        /* @param joueur : ne recherche que les proprietes de ce joueur */
		/* @param excludes : terrain exclu, a ne pas renvoyer */
        this.findOthersInterestProprietes = function (joueur,excludes) {
            var interests = [];
            var treatGroups = []; // groupes traites
            // On parcourt les terrains du joueur. Pour chaque, on etudie le groupe
            for (var index in this.maisons) {
                var maison = this.maisons[index];
                if (treatGroups[maison.groupe.color] == null) {
                    // Structure : free,joueur,adversaire,nbAdversaires
                    var infos = maison.groupe.getInfos(this);
                    // Si tous les terrains vendus et un terrain a l'adversaire ou deux terrains a deux adversaires differents, on peut echanger
                    if (infos.free == 0 && (infos.adversaire == 1 || infos.nbAdversaires > 1)) {
                        for (var idx in infos.maisons) {
                            if (joueur == null || joueur.equals(infos.maisons[idx].joueurPossede)) {
                                interests.push({
                                    maison: infos.maisons[idx],
                                    nb: infos.maisons.length
                                }); // On ajoute chaque maison avec le nombre a acheter pour terminer le groupe
                            }
                        }
                    }
                    treatGroups[maison.groupe.color] = true;
                }
            }

            var groups = this.findGroupes();

            var _self = this;

            // On trie la liste selon rapport (argent de 3 maison / achat terrain + 3 maisons), le nombre de terrains a acheter
            // on rajoute le fait que ca appartient a la strategie et que c'est constructible
            interests.sort(function (a, b) {
                /* Premier critere : nombre de terrain a acheter pour finir le groupe */
                var critere1 = a.nb / b.nb;
                /* Second critere : rentabilite du terrain */
                var critere2 = a.maison.getRentabiliteBrute() / b.maison.getRentabiliteBrute();

                var voisinA = 1,
                    voisinB = 1;
                for (var g in groups) {
                    if (groups[g].group.isVoisin(a.maison.groupe)) {
                        voisinA++;
                    }
                    if (groups[g].group.isVoisin(b.maison.groupe)) {
                        voisinB++;
                    }
                }
                var critere3 = voisinA / voisinB;
				/* Quatrieme critere : fait une ligne avec un autre groupe du joueur */
				var critere4 = 1;
				if(_self.strategie!=null){
					var interetA = _self.strategie.interetPropriete(a.maison);
					var interetB = _self.strategie.interetPropriete(b.maison);
					if(interetA!=interetB){
						critere4 = (interetA)?0.5:2;
					}
				}
				var critere5 = 1;
				if(a.maison.constructible!=b.maison.constructible){
					critere5 = (a.maison.constructible)?0.5:2;
				}
				var criteres = critere1 * critere2 * critere3 * critere4 * critere5;
                return criteres - 1;
            });
            return interests;

        }

        /* Renvoie la liste des terrains peu important (gare, compagnie et terrains hypotheques) */
        /* On integre dans les resultats le nombre d'elements par groupe */
        this.findUnterestsProprietes = function () {
            var proprietes = [];
            var nbByGroups = [];
            for (var m in this.maisons) {
                var maison = this.maisons[m];
                if (!maison.constructible) {
                    proprietes.push(maison);
                    if (nbByGroups[maison.groupe.nom] == null) {
                        nbByGroups[maison.groupe.nom] = 1;
                    } else {
                        nbByGroups[maison.groupe.nom]++;
                    }
                }
            }

            return {
                proprietes: proprietes,
                nbByGroups: nbByGroups
            };
        }

        /**
         * Renvoie les terrains constructibles qui n'interessent (pas en groupe)
         * @param interestTerrains : terrains qui interessent, on filtre
         */
        this.findOthersProperties = function (interestTerrains) {
            var terrains = [];
            var mapInterests = [];
            for (var i in interestTerrains) {
                mapInterests[interestTerrains[i].id] = 1;
            }
            for (var f in this.maisons) {
                var maison = this.maisons[f];
                if (maison.constructible && !maison.isGroupee() && mapInterests[maison.id] == null) {
                    terrains.push(maison);
                }
            }
            return terrains;
        }

        /* Renvoie les groupes constructibles avec les proprietes de chaque */
        this.findMaisonsConstructibles = function () {
            var mc = new Array();
            var colorsOK = new Array();
            var colorsKO = new Array();

            // Si une maison est hypothequee, on ne peut plus construire sur le groupe
            for (var i = 0; i < this.maisons.length; i++) {
                var m = this.maisons[i];
                if (m.constructible == true) {
                    if (colorsOK[m.color] == true) {
                        mc.push(m); // on a la couleur, on ajoute
                    } else {
                        if (colorsKO[m.color] == null) {
                            // On recherche si on a toutes les couleurs
                            var ok = true;
                            // On cherche une propriete qui n'appartient pas au joueur
                            for (var f in m.groupe.fiches) {
                                var fiche = m.groupe.fiches[f];
                                if (fiche.constructible == true &&
                                    (fiche.joueurPossede == null || !fiche.joueurPossede.equals(this) || fiche.statutHypotheque == true)) {
                                    ok = false;
                                }
                            }
                            if (!ok) {
                                colorsKO[m.color] = true;
                            } else {
                                colorsOK[m.color] = true;
                                mc[mc.length] = m;
                            }
                        }
                    }
                }
            }
            return mc;
        }
    }

    function Pion(color, joueur) {
        this.etat = 2;
        this.position = 0;
        this.joueur = joueur;
        this.stats = {
            tour: 0,
            prison: 0
        }; // stat du joueur		
        this.pion = DrawerFactory.getPionJoueur(color);
        Drawer.addRealTime(this.pion);

        /* Supprime le pion en cas de defaite */
        this.remove = function () {
            Drawer.removeComponent(this.pion);
        }

        // Ca directement en prison, sans passer par la case depart, en coupant
        this.goPrison = function (callback) {
            this.stats.prison++;
            // Manque le callback
            this.goDirectToCell(3, 0, callback);
        }

        this.deplaceValeursDes = function (des) {
            var pos = this.position + des;
            var axe = this.etat;
            while (pos >= 10) {
                pos -= 10;
                axe = (axe + 1) % 4;
            }
            return {
                pos: pos,
                axe: axe
            }
        }

        this.goto = function (etat, pos, call) {
			var id = etat+"-"+pos;
			if(stats.positions[id] == null){
				stats.positions[id] = 1;
			}
			else{
				stats.positions[id]++;
			}
            $.trigger("monopoly.debug", {
                message: joueurCourant.nom + " est en " + this.etat + "-" + this.position + " et va en " + id
            });
			// On gere le cas de la case depart (si elle est sur le trajet)
			var depart = this.etat*10 + this.position;
			var cible = etat*10 + pos;
			if((depart < 20 && cible > 20) || (depart > cible && (depart < 20 || cible > 20))){
				this.treatCaseDepart();
			}
			this.etat = etat;
			this.position = pos;
			this.pion.goto(etat, pos, call,true);
        }

		// Si on passe par la case depart, on prend 20000 Francs
        this.treatCaseDepart = function () {
			this.stats.tour++;
			this.joueur.gagner(20000);            
        }    

        this.goDirectToCell = function (etat, pos, callback) {
			this.pion.gotoDirect(etat,pos,callback);           
        }
    }

    function CarteActionSpeciale(titre, actionSpeciale, etat, pos) {
        this.titre = titre;
        this.actionSpeciale = actionSpeciale;
        this.id = etat + "-" + pos;
        this.drawing = DrawerFactory.getCaseSpeciale(etat,titre);
        Drawer.add(this.drawing);

        this.action = function () {
			$.trigger('monopoly.visiteTerrain',{joueur:joueurCourant,maison:{color:'black',nom:this.titre}});
            this.actionSpeciale();
        }
    }

    /* Case speciale, comme la taxe de luxe */
    function CarteSpeciale(titre, montant, etat, pos, img) {
        this.id = etat + "-" + pos;
        this.drawing = DrawerFactory.getCase(pos, etat, null, titre, CURRENCY + " " + montant, img);
        Drawer.add(this.drawing);
        this.action = function () {
            return createMessage(titre, "lightblue", "Vous devez payer la somme de " + montant + " " + CURRENCY, function (param) {
                param.joueur.payerParcGratuit(param.montant, function () {
                    changeJoueur();
                });
            }, {
                joueur: joueurCourant,
                montant: montant
            });
        }
    }

    /* Action de déplacement vers une case */
    /* @param direct : si renseigné a vrai, le pion est deplacé directement vers la case, sans passer par la case depart */
    function GotoCarte(axe, pos, direct) {
        this.type = "goto";
        this.action = function () {
            if (direct) {
                joueurCourant.pion.goDirectToCell(axe, pos, doActions);
            } else {
                joueurCourant.pion.goto(axe, pos, doActions);
            }
        }
    }

    /* Carte sortie de prison */
    function PrisonCarte() {
        this.type = "prison";
        this.joueurPossede = null;
        this.action = function () {
            joueurCourant.cartesSortiePrison.push(this);
            this.joueurPossede = joueurCourant;
            changeJoueur();
        }
        this.isLibre = function () {
            return this.joueurPossede == null;
        }
    }

    /* Action de déplacement d'un certain nombre de case */
    function MoveNbCarte(nb) {
        this.type = "move";
        this.action = function () {
            var pos = joueurCourant.pion.deplaceValeursDes(nb + 40); // On ajoute 40 pour les cases négatives
            joueurCourant.pion.goDirectToCell(pos.axe, pos.pos, doActions);
        }
    }

    /* Action de gain d'argent pour une carte */
    function PayerCarte(montant) {
        this.type = "taxe";
        this.montant = montant;
        this.action = function () {
            joueurCourant.payerParcGratuit(this.montant, function () {
                changeJoueur();
            });
        }
    }

    /* Action de perte d'argent pour une carte */
    function GagnerCarte(montant) {
        this.type = "prime";
        this.montant = montant;
        this.action = function () {
            joueurCourant.gagner(this.montant);
            changeJoueur();
        }
    }

    function CarteChance(libelle, carte) {
        this.carte = carte;
        this.action = function () {
            return createMessage(titles.chance, "lightblue", libelle, function (param) {
                $.trigger('monopoly.chance.message', {
                    joueur: joueurCourant,
                    message: libelle
                });
                carte.action();
            }, {});
        }
    }

    function CarteCaisseDeCommunaute(libelle, carte) {
        this.carte = carte;
        this.action = function () {
            $.trigger('monopoly.caissecommunaute.message', {
                joueur: joueurCourant,
                message: libelle
            });
            return createMessage(titles.communaute, "pink", libelle, function (param) {
                carte.action();
            }, {});
        }
    }

    function Chance(etat, pos,img) {
        this.id = etat + "-" + pos;
        img = img || {
            src: "img/interrogation.png",
            width: 50,
            height: 60
        };
        this.drawing = DrawerFactory.getCase(pos, etat, null, titles.chance, null, img);
        Drawer.add(this.drawing);
        this.action = function () {
            if (cartesChance.length == 0) {
                throw "Aucune carte chance";
            }
            var randomValue = Math.round((Math.random() * 1000)) % (cartesChance.length);
            var c = cartesChance[randomValue];
            // On test si la carte est une carte sortie de prison est possedee par un joueur
            if (c.carte.type == "prison" && !c.carte.isLibre()) {
                // on prend la carte suivante
                c = cartesChance[randomValue + 1 % (cartesChance.length)];
            }
            return c.action();
        }
    }

    function CaisseDeCommunaute(etat, pos, img) {
        this.id = etat + "-" + pos;
        img = img || {
            src: "img/banque2.png",
            width: 60,
            height: 60
        };
        this.drawing = DrawerFactory.getCase(pos, etat, null, titles.communaute, null, img );
        Drawer.add(this.drawing);
        this.action = function () {
            if (cartesCaisseCommunaute.length == 0) {
                throw "Aucune carte caisse de communaute";
            }
            var randomValue = Math.round((Math.random() * 1000)) % (cartesCaisseCommunaute.length);
            var c = cartesCaisseCommunaute[randomValue];
            // On test si la carte est une carte sortie de prison est possedee par un joueur
            if (c.carte.type == "prison" && !c.carte.isLibre()) {
                // on prend la carte suivante
                c = cartesCaisseCommunaute[(randomValue + 1) % (cartesCaisseCommunaute.length)];
            }
            return c.action();
        }
    }

    // Gere les dessins
var Drawer = {
    components: new Array(),	// Un ordre est ajoute lors de l'insertion
    height: 0,
    width: 0,
    interval: null,
    intervalRT: null,
    canvas: null,
    intervals: [], // Stocke les flags d'arret du refresh
    canvasRT: null, //Canvas de temps reel
    // ajoute un composant. On indique le canvas sur lequel il s'affiche
	/* @param order : Si present, indique l'ordre d'affichage. Le plus petit en premier */
    add: function (component, order) {
		if(component == null){return;}
        component.getId = function () {
            return Drawer.canvas.canvas.id
        };
		component.order = (order==null)?0:order;
        Drawer.components.push(component);        
    },
    addRealTime: function (component) {
        component.getId = function () {
            return Drawer.canvasRT.canvas.id
        };
        Drawer.components.push(component);
    },
    removeComponent: function (component) {
        // Boucle sur les composants et supprime si l'id est le meme
        for (var i = 0; i < this.components.length; i++) {
            if (this.components[i].id == component.id) {
                this.components.splice(i, 1);
                return;
            }
        }
    },
    clear: function (canvas) {
        canvas.clearRect(0, 0, this.width, this.height);
    },
    /* Rafraichit un seul canvas */
    refresh: function (canvas) {
        Drawer.clear(canvas);
        for (var i = 0; i < Drawer.components.length; i++) {
            if (Drawer.components[i].getId() === canvas.canvas.id) {
				Drawer.components[i].draw(canvas);
            }
        }
    },
    // Refraichissement du graphique, time en ms
    setFrequency: function (time, canvas) {
        if (Drawer.intervals[canvas.canvas.id] != null) {
            clearInterval(Drawer.intervals[canvas.canvas.id]);
        }
        Drawer.intervals[canvas.canvas.id] = setInterval(function () {
            Drawer.refresh(canvas);
        }, time);
    },
    init: function (width, height) {
		// On tri les composants qui ont ete ajoutes
		this.components.sort(function(a,b){
			return a.order - b.order;
		});
        this.width = width;
        this.height = height;
        this.canvas = document.getElementById("canvas").getContext("2d");
        this.canvasRT = document.getElementById("canvas_rt").getContext("2d");
        this.canvas.strokeStyle = '#AA0000';
        this.canvasRT.strokeStyle = '#AA0000';
        // On ne recharge pas le plateau, il n'est charge qu'une seule fois (ou rechargement a la main)
        this.refresh(this.canvas);
        //this.setFrequency(2000, this.canvas);
        this.setFrequency(50, this.canvasRT);

        $.bind('refreshPlateau', function () {
            Drawer.refresh(Drawer.canvas);
        });
        return this;
    }
};



    
    

    /* Represente un groupe de terrain */
    function Groupe(nom, color) {
        this.nom = nom;
        this.color = color;
        /* Liste de ses terrains */
        this.fiches = [];
        this.groupePrecedent = null;
        this.groupeSuivant = null;

        this.equals = function (groupe) {
            if (groupe == null) {
                return false;
            }
            return this.color == groupe.color;
        }

        this.getVoisins = function () {
            return [this.groupePrecedent, this.groupeSuivant];
        }

        this.isVoisin = function (groupe) {
            return (this.groupePrecedent != null && this.groupePrecedent.equals(groupe)) || (this.groupeSuivant != null && this.groupeSuivant.equals(groupe));
        }

        this.equals = function (groupe) {
            return this.color == groupe.color;
        }

        /* Ajoute une fiche au groupe (lors de l'init) */
        this.add = function (fiche) {
            this.fiches.push(fiche);
            fiche.groupe = this;
            return this;
        }

        /* Indique que tous les terrains appartiennent a la meme personne */
        this.isGroupee = function () {
            if (this.fiches == null || this.fiches.length == 0) {
                return false;
            }
            var joueur = this.fiches[0].joueurPossede;
            for (var i = 0; i < this.fiches.length; i++) {
                if (this.fiches[i].joueurPossede == null || !this.fiches[i].joueurPossede.equals(joueur)) {
                    return false;
                }
                joueur = this.fiches[i].joueurPossede;
            }
            return true;
        }

        /* Indique que le terrain possede des constructions */
        this.isBuild = function () {
            if (this.fiches == null || fiches.length == 0) {
                return false;
            }
            for (var i = 0; i < this.fiches.length; i++) {
                if (this.fiches[i].nbMaison > 0) {
                    return true;
                }
            }

            return false;
        }

        this.getAverageConstructions = function () {
            var nb = 0;
            for (var i = 0; i < this.fiches.length; i++) {
                nb += this.fiches[i].nbMaison;
            }
            return nb / this.fiches.length;
        }

        /* Renvoie le nombre de constructions sur le groupe */
        this.getConstructions = function () {
            var constructions = {
                maison: 0,
                hotel: 0
            };
            for (var i = 0; i < this.fiches.length; i++) {
                if (this.fiches[i].hotel) {
                    constructions.hotel++;
                } else {
                    constructions.maison += this.fiches[i].nbMaison;
                }
            }
            return constructions;
        }

        /* Renvoie des infos sur les proprietes du groupe. Ajoute la liste des proprietes qui n'appartiennent pas au joueur */
        this.getInfos = function (joueur) {
            var infos = {
                free: 0,
                joueur: 0,
                adversaire: 0,
                nbAdversaires: 0,
                maisons: [],
                hypotheque: 0
            };
            var adversaires = []; // Liste des adversaires possedant un terrains
            for (var i = 0; i < this.fiches.length; i++) {
                var f = this.fiches[i];
                if (f.statut == ETAT_LIBRE) {
                    infos.free++;
                } else {
                    if (f.statutHypotheque) {
                        infos.hypotheque++;
                    }
                    if (joueur.equals(f.joueurPossede)) {
                        infos.joueur++;
                    } else {
                        infos.adversaire++;
                        infos.maisons.push(f);
                        adversaires[f.joueurPossede.id] = 1;
                    }
                }
            }
            infos.nbAdversaires = adversaires.size();
            return infos;
        }

        /* Renvoie le nombre de fiche dans le groupe */
        this.getNb = function () {
            return (this.fiches == null) ? 0 : this.fiches.length;
        }

    }

    /* Represente un terrain */
    function Fiche(etat, pos, colors, nom, achat, loyers, prixMaison, img) {
        this.nom = nom;
        this.groupe = null;
        this.color = colors[0];
        this.secondColor = (colors.length == 2) ? colors[1] : colors[0];
        this.achat = achat;
        this.montantHypotheque = achat / 2;
        this.achatHypotheque = this.montantHypotheque * 1.1;
        this.loyer = loyers;
        this.loyerHotel = (loyers != null && loyers.length == 6) ? loyers[5] : 0;
        this.prixMaison = prixMaison;

        this.statut = ETAT_LIBRE;
        this.joueurPossede = null;
        this.statutHypotheque = false;
        this.fiche = $('#fiche');
        this.nbMaison = 0; // Nombre de maison construite sur le terrain par le proprietaire
        this.hotel = false; // Si un hotel est present
        this.maisons = new Array();
        this.constructible = true;
        this.isTerrain = true;
        this.etat = etat;
        this.pos = pos;
        var current = this;
        this.id = etat + "-" + pos;
        this.input = null; // Bouton 

        this.drawing = DrawerFactory.getCase(pos, etat, this.color, this.nom, CURRENCY + " " + achat, img);
        Drawer.add(this.drawing);

        this.equals = function (fiche) {
            if (fiche == null) {
                return false;
            }
            return this.id == fiche.id;
        }

        /* Renvoie l'etat courant du terrain (JSON) */
        this.save = function () {
            // On renvoie le statut, le proprio, le nombre de maison, le statut hypotheque
            return {
                id: this.id,
                statut: this.statut,
                joueur: ((this.joueurPossede != null) ? this.joueurPossede.id : null),
                nb: this.nbMaison,
                hypotheque: this.statutHypotheque
            };
        }

        this.load = function (data) {
            var joueur = data.joueur != null ? getJoueurById(data.joueur) : null;
            this.joueurPossede = joueur;
            if (joueur != null) {
                joueur.maisons.push(this); // Ajoute a la liste de ses maisons
                joueur._drawTitrePropriete(this);
            }
            this.id = data.id;
            this.statut = data.statut;
            this.setNbMaison(data.nb, true);
            // On deduit les quantites du gestionnaire
            if(data.nb > 0){
                if(data.nb == 5){
                    GestionConstructions.buyHotels(1);
                }
                else{
                    GestionConstructions.buyHouses(data.nb);
                }
            }
            this.statutHypotheque = data.hypotheque;
            if (this.statutHypotheque == true) {
                this.input.addClass('hypotheque');
            }
        }

        this.vendu = function (joueur) {
            this.statut = ETAT_ACHETE;
            this.joueurPossede = joueur;
            this.joueurPossede.maisons.push(this);
            $.trigger("monopoly.acheteMaison", {
                joueur: joueur,
                maison: this
            });
        }

        /* Le terrain est rendu (manque d'argent) */
        this.libere = function () {
            this.statut = ETAT_LIBRE;
			this.statutHypotheque = false;
            this.joueurPossede = null;
            this.setNbMaison(0, true);
            this.hotel = false;
        }

        /* Renvoie la rentabilite de la propriete. Se base sur le rapport entre le loyer de trois maisons et le prix d'achat d'une maison */
        this.getRentabilite = function () {
            var ponderation = 10; // Facteur pour nivelle le taux
            if (!this.constructible || this.nbMaison >= 3) {
                return 0;
            } else {
                // Maison du groupe
                var proprietes = this.groupe.fiches;
                var nbMaisonsConstruites = 0;
                for (var i = 0; i < proprietes.length; i++) {
                    nbMaisonsConstruites += proprietes[i].nbMaison;
                }
                return (this.loyer[3] / Math.max((proprietes.length * 3 - nbMaisonsConstruites) * this.prixMaison, 1)) / ponderation;
            }
        }

        /* Renvoie la rentabilite brute, sans prise en compte des maisons achetees */
        this.getRentabiliteBrute = function () {
            if (!this.constructible) {
                return 0;
            }
            return this.loyer[3] / (this.achat + 3 * this.prixMaison);
        }

        /* Hypotheque le terrain */
        this.hypotheque = function () {
            if (this.input == null || this.statut != ETAT_ACHETE || this.nbMaison > 0) {
                throw "Impossible d'hypothequer ce terrain";
            }
            this.statutHypotheque = true;
            this.input.addClass('hypotheque');
            this.joueurPossede.gagner(this.montantHypotheque);
            $.trigger('monopoly.hypothequeMaison', {
                joueur: this.joueurPossede,
                maison: this
            });
        }

        this.leveHypotheque = function () {
            if (this.input == null || this.statut != ETAT_ACHETE || this.statutHypotheque == false) {
                return;
            }
            var cout = Math.round(this.achatHypotheque);
            if (this.joueurPossede.montant < cout) {
                throw "Impossible de lever l'hypotheque";
            }
            this.statutHypotheque = false;
            this.joueurPossede.payer(cout);
            this.input.removeClass('hypotheque');
            $.trigger('monopoly.leveHypothequeMaison', {
                joueur: this.joueurPossede,
                maison: this
            });
        }

        this.isLibre = function () {
            return this.statut == ETAT_LIBRE;
        }

        this.isConstructed = function () {
            return this.nbMaison > 0;
        }

        /* Modifie le nombre de maison sur le terrain */
        this.setNbMaison = function (nb, noRefresh) {
            this.nbMaison = nb;
            this.drawing.setNbMaison(nb);
            if (this.nbMaison == 5) {
                this.hotel = true;
            } else {
                this.hotel = false;
            }
            // Lancer un evenement pour rafraichir le plateau
            if (!noRefresh) {
                $.trigger('refreshPlateau');
            }
        }

        this.action = function () {
            this.fiche.dialog('option', 'title', nom);
            // si on est chez soi, on affiche pas
            if (this.joueurPossede != null && this.joueurPossede.equals(joueurCourant)) {
                return this.chezSoi();
            }
            if (this.joueurPossede != null && this.statutHypotheque == false) { // on doit payer un loyer
                return this.payerLoyer();
            }

            return this.openFiche();
        }

        this.chezSoi = function () {
			$.trigger('monopoly.chezsoi',{joueur:this.joueurPossede,maison:this});
            return createMessage("Vous etes " + this.nom, this.color, "Vous etes chez vous", changeJoueur);
        }

        this.sellMaison = function (joueur, noRefresh) {
            if (joueur == null || !this.joueurPossede.equals(joueur) || this.nbMaison <= 0) {
                return false;
            }
            if (this.nbMaison == 5) {
                // On verifie qu'il reste assez de maison (4)
                if (GestionConstructions.getRestHouse() >= 4) {
                    GestionConstructions.buyHouses(4);
                    GestionConstructions.sellHotel();
                    this.hotel = false;
                } else {
                    return; // Pas assez de maison
                }
            } else {
                GestionConstructions.sellHouse();
            }
            this.setNbMaison(this.nbMaison - 1, noRefresh);
            return true;
        }


        /* Utilise principalement par un joueur ordi qui achete les maisons une par une. */
        /* Un joueur humain utilise des methodes de modifications directes */
        this.buyMaison = function (joueur, noRefresh) {
            if (joueur == null || !this.joueurPossede.equals(joueur) || this.nbMaison >= 5) {
                return;
            }
            // On verifie la dispo
            if ((this.nbMaison == 4 && !GestionConstructions.isFreeHotel()) || (this.nbMaison < 4 && !GestionConstructions.isFreeHouse())) {
                throw "Pas de construction disponible";

            }
            this.setNbMaison(this.nbMaison + 1, noRefresh);
            if (this.nbMaison == 5) {
                this.hotel = true;
                GestionConstructions.buyHotel();
            } else {
                GestionConstructions.buyHouse();
            }
        }

        this.getLoyer = function () {
            if (this.statutHypotheque) {
                return 0;
            }
            if (this.hotel == true) {
                return this.loyerHotel;
            }
            if (this.nbMaison == 0 && this.isGroupee()) {
                return this.loyer[0] * 2;
            }
            return this.loyer[this.nbMaison];
        }

        this.payerLoyer = function () {
            return createMessage("Vous etes " + this.nom, this.color, "Vous etes chez " + this.joueurPossede.nom + " vous devez payez la somme de " + this.getLoyer() + " " + CURRENCY, function (param) {
                $.trigger('monopoly.payerLoyer', {
                    joueur: param.joueurPaye,
                    maison: param.maison
                });
                param.joueurPaye.payerTo(param.loyer, param.joueurLoyer);
            }, {
                loyer: this.getLoyer(),
                joueurPaye: joueurCourant,
                joueurLoyer: this.joueurPossede,
                maison: this
            });
        }

        this.noArgent = function () {
            //construireMaisons(true);
        }

        // Ouvre la fiche d'une propriete
        this.openFiche = function () {
            var buttons = this.getButtons();
            this.fiche.dialog('option', 'buttons', buttons);
            loadFiche(this);
            if (joueurCourant.canPlay) {
                this.fiche.dialog('open');
            }
            return buttons;
        }

        this.getButtons = function () {
            if (this.statut == ETAT_LIBRE) {
                if (joueurCourant.montant < this.achat) {
                    return {
                        "Pas assez d'argent": function () {
                            joueurCourant.refuseMaison(current,doCloseFiche);
                        }
                    };
                } else {
                    return {
                        "Acheter": function () {
                            var id = joueurCourant.pion.etat + "-" + joueurCourant.pion.position;
                            joueurCourant.acheteMaison(current);
                            doCloseFiche();
                        },
                        "Refuser": function () {
                            joueurCourant.refuseMaison(current,doCloseFiche);
                        }
                    };
                }
            } else {
                return {
                    "Fermer": function () {
                        doCloseFiche();
                    }
                };
            }
        }

        /* Renvoie vrai si le reste du groupe appartient au meme joueur.*/
        this.isGroupee = function () {
            return (this.groupe == null) ? false : this.groupe.isGroupee();
        }

        /* Renvoie vrai si le groupe est complet et construit */
        /* Renvoie vrai si le reste du groupe appartient au meme joueur.*/
        this.isGroupeeAndBuild = function () {
            if (this.joueurPossede == null) {
                return false;
            }
            // Renvoie les maisons constructibles (lorsque le groupe est complet)
            var l = this.joueurPossede.findMaisonsConstructibles();
            for (var i = 0; i < l.length; i++) {
                // Si la couleur apparait dans une propriete, le groupe est complet
                if (l[i].color == this.color && l[i].nbMaison > 0) {
                    return true;
                }
            }
            return false;
        }
    }

    function FicheGare(etat, pos, color, nom, achat, loyers, img) {
        Fiche.call(this, etat, pos, color, nom, achat, loyers, null, img || {
            src: "img/big_train.png",
            width: 50,
            height: 35,
			margin: 5
        });
        this.type = "gare";
        this.constructible = false;
        this.getLoyer = function () {
            if (this.joueurPossede != null) {
                var nb = -1;
                for (var i = 0; i < this.joueurPossede.maisons.length; i++) {
                    if (this.joueurPossede.maisons[i].type == "gare") {
                        nb++;
                    }
                }
                return this.loyer[nb];
            }
            return 0;
        }
    }

    function FicheCompagnie(etat, pos, color, nom, achat, loyers,img) {
        Fiche.call(this, etat, pos, color, nom, achat, loyers, null,img || {
            src: "img/light.png",
            width: 50,
            height: 35,
			margin: 5
        });
        this.fiche = $('#ficheCompagnie');
        this.type = "compagnie";
        this.constructible = false;

        this.getLoyer = function () {
			var loyer = GestionDes.total();
            if (this.joueurPossede != null) {
                var nb = -1;
                for (var i = 0; i < this.joueurPossede.maisons.length; i++) {
                    if (this.joueurPossede.maisons[i].type == "compagnie") {
                        nb++;
                    }
                }
                return this.loyer[nb] * loyer;
            }
            return this.loyer[0] * loyer;
        }
    }


    // Cree le comportement lorsque le joueur arrive sur la carte

    function doActions() {
        var fiche = GestionFiche.getById(joueurCourant.pion.etat + "-" + joueurCourant.pion.position);
        if (fiche == null) {
            changeJoueur();
            return;
        }
        var buttons = fiche.action(); // Recupere les actions jouables en tombant sur cette case 
        // une fois l'action cree, le joueur doit faire une action
        joueurCourant.actionApresDes(buttons, fiche);
    }

    function getWinner() {
        var defaites = 0;
        var gagnantProbable;
        for (var index in joueurs) {
            if (joueurs[index].defaite == true) {
                defaites++;
            } else {
                gagnantProbable = joueurs[index];
            }
        }
        if (defaites == joueurs.length - 1) {
            return gagnantProbable;
        }
        return null;
    }

    function getNextJoueur() {
        if (joueurCourant == null) {
            return joueurs[0];
        }
        // On verifie s'il y a encore des joueurs "vivants"
        if (joueurCourant.bloque) {
            return null;
        }
        var gagnant = getWinner();
        if (gagnant != null) {
            // On a un vainqueur
            throw gagnant;
        }
        var joueur = joueurCourant;
        /* Changement de joueur */
        if(!GestionDes.isDouble()){
		    var pos = 0;
            joueur = joueurs[(joueur.numero + 1) % (joueurs.length)];
            while (joueur.defaite == true & pos++ < joueurs.length) {
                joueur = joueurs[(joueur.numero + 1) % (joueurs.length)];
            }
            // On incremente le nb de tours
            if (joueur.numero < joueurCourant.numero) {
                nbTours++;
				stats.nbTours++;
            }
        }
        return joueur;
    }

    function changeJoueur() {
        // Si un echange est en cours, on ne change pas de joueur
        if (GestionEchange.running) {
            return;
        }
        // Joueur bloque, on le debloque avant de continuer
        var joueur = null;
        try {
            joueur = getNextJoueur();
        } catch (gagnant) {
			showVainqueur(gagnant);
            return gagnant;
        }
        if (joueur == null) {
            return null;
        }
		if(!GestionDes.isDouble()){
            GestionDes.resetDouble();
        }
        selectJoueur(joueur);
        return null;
    }
	
	function formatTempsJeu(){		
		var time = Math.round((new Date().getTime() - stats.heureDebut)/1000);
		if(time < 60){
			return sec + " sec";
		}
		var sec = time%60;
		time = Math.round(time/60);
		return time + " min et " + sec + " sec";
	}
	
	function showVainqueur(gagnant){
		$.trigger('monopoly.victoire',{joueur:gagnant});
		// On affiche les resultats complets
		var perdants = [];
		for(var j in joueurs){
			if(joueurs[j].defaite){
				perdants.push(joueurs[j]);
			}
		}
		perdants.sort(function(a,b){
			if(a.tourDefaite == b.tourDefaite){
				return b.numero - a.numero;
			}
			return b.tourDefaite - a.tourDefaite;
		});
        
		var message = "Le joueur " + gagnant.nom + " a gagné en " + formatTempsJeu() + ".<br/>";
		message+="1 - " + gagnant.nom + "<br/>";
		
		for(var i = 0 ; i < perdants.length ; i++){
            message+= (i+2) + " - " + perdants[i].nom + "<br/>";
		}
		createMessage("Fin de partie", "green", message, null, null, true);
		console.log("stats terrains",writePositions(stats.positions));
	}

	function writePositions(){
		var str = "position;nb";
		for(var p in stats.positions){
			str += "\n" + p + ";" + stats.positions[p];
		}
		return str;
	}
	
    function closeFiche() {
        changeJoueur();
    }

	/* Gere le fonctionnement du des */
	var GestionDes = {
		nbAnimation:8,
		cube:{des1:null,des2:null},
		des1:0,
		des2:0,
		nbDouble:0,	// Nombre de double de suite pour le joueur en cours
		rollColor:'#000000',
		init:function(rollColor){
			this.cube.des1 = DrawerFactory.getDes(150, 200, 50);
			this.cube.des2 = DrawerFactory.getDes(210, 200, 50);
			Drawer.addRealTime(this.cube.des1);
			Drawer.addRealTime(this.cube.des2);
			this.rollColor = rollColor;
		},
		resetDouble:function(){
			this.nbDouble = 0;
		},
		_rand:function(){
			return Math.round((Math.random() * 1000)) % 6 + 1;
		},
		/* Action avant le lancement du des */
		before:function(callback){
			if (joueurCourant.enPrison) {
				// Propose au joueur de payer ou utiliser une carte
				var buttons = createPrisonMessage(joueurCourant.nbDouble, function () {
					callback();
				});
				joueurCourant.actionAvantDesPrison(buttons);
			} else {
				callback();
			}
		},
		/* Cas lorsque le joueur est en prison */
		treatPrison:function(message){
			if (this.isDouble()) {
				MessageDisplayer.write(joueurCourant, message + " et sort de prison");
				var buttons = createMessage("Libere de prison", "lightblue", "Vous etes liberes de prison grace a un double", function () {
					joueurCourant.exitPrison();
					GestionDes.endLancer();
				}, {});
				joueurCourant.actionApresDes(buttons, null);
				return;
			} else {
				if (joueurCourant.nbDouble == 2) {
					MessageDisplayer.write(joueurCourant, message + " et sort de prison en payant " + CURRENCY + " 5.000");
					var buttons = createMessage("Libere de prison", "lightblue", "Vous etes liberes de prison, mais vous devez payer " + CURRENCY + " 5.000 !", function () {
						joueurCourant.payerParcGratuit(5000, function () {
							joueurCourant.exitPrison();
							GestionDes.endLancer();
						});
					}, {});
					joueurCourant.actionApresDes(buttons, null);
					return;
				} else {
					MessageDisplayer.write(joueurCourant, message + " et reste en prison");
					joueurCourant.nbDouble++;
					var buttons = createMessage("Tour " + joueurCourant.nbDouble, "red", "Vous restez en prison, vous n'avez pas fait de double.", function () {
						changeJoueur();
					}, {});
					joueurCourant.actionApresDes(buttons, null);
					return;
				}
			}
		},
		/* Action apres le lancement des des */
		/* Regle de gestion 
		 * 1 - Le joueur peut payer 5000 Frs ou utiliser une carte sortie de prison avant de lancer les des
		 * 2 : Le joueur fait un double ou a payer, il sort
		 * 3 - Le joueur atteint sont 3eme lancer, il paie
		 * 4 - Pas de double, il reste en prison
		 * */
		after:function(){
			var message = "lance les dés et fait " + (this.total()) + " (" + this.des1 + " et " + this.des2 + ") ";
			// Separer le code
			if (joueurCourant.enPrison == true) {
				this.treatPrison(message);
				return;
			} else {
				if (this.isDouble()) {
					if (this.nbDouble >= 2) {
						// Creer un message
						var buttons = createMessage("Allez en prison", "red", "Vous avez fait 3 doubles, vous allez en prison", function () {
							MessageDisplayer.write(joueurCourant, message + ", a fait 3 doubles et va en prison");
							$('#informationsCentrale').text("3eme double, allez en PRISON");
							// On met des valeurs differentes pour les des pour que le joueur ne rejoue pas
							GestionDes.des2++;
							// Le changement de joueur lorsque le deplacement est termine
							joueurCourant.goPrison();
						}, {});
						joueurCourant.actionApresDes(buttons, null);
						return;
					} else {
						this.nbDouble++;
						MessageDisplayer.write(joueurCourant, message + " et rejoue");
					}
				}else{
					MessageDisplayer.write(joueurCourant, message);
				}
			}
			GestionDes.endLancer();
		},
		endLancer:function(){
			joueurCourant.joueDes(this.total());
			if (this.isDouble()) {
				$('#informationsCentrale').html("Relancez");
			}else{
				$('#informationsCentrale').html("");
			}
		},
		isDouble:function(){
			return this.des1 == this.des2;
		},
		/* lancement du des */
		lancer:function(){
			this.before(function(){
				GestionDes.des1 = GestionDes._rand();
				GestionDes.des2 = GestionDes._rand();
				GestionDes._anime();
			});			
		},
		_anime:function(){
			$('.action-joueur').attr('disabled', 'disabled').addClass('disabled');   
			var nb = this.nbAnimation;
			var interval = setInterval(function () {
				if (nb-- < 0) {
					clearInterval(interval);
					GestionDes._drawCubes(GestionDes.des1,GestionDes.des2);
					GestionDes.after();
					return;
				}
				GestionDes._drawCubes(GestionDes._rand(),GestionDes._rand(),GestionDes.rollColor);
			}, 100);
		},
		_drawCubes:function(val1,val2,color){
			GestionDes.cube.des1.setValue(val1, color);
			GestionDes.cube.des2.setValue(val2, color);
		},
		/* Renvoie le total des dés */
		total:function(){
			return this.des1 + this.des2;
		}		
	}
	
    function init(nomPlateau, debugValue) {
        DEBUG = debugValue;
        MessageDisplayer.init('idInfoBox');
        initDetailFiche();
        initFiches();
        initPanels();
		initJoueurs();
        GestionTerrains.init();
    }

    function initPanels() {
		loadListPlateaux(showListPlateaux);
        $('#message').dialog({
            autoOpen: false
        });
        $('#message').prev().css("background", "url()");
        /* Gestion de la sauvegarde */
        $('#idSavePanel').click(function () {
            if (currentSauvegardeName == null) {
                currentSauvegardeName = prompt("Nom de la sauvegarde (si vide, defini par defaut)");
                if (currentSauvegardeName == null) {
                    return;
                }
                currentSauvegardeName = Sauvegarde.getSauvegardeName(currentSauvegardeName);
            }
            Sauvegarde.save(currentSauvegardeName);
        });
        // panneau de creation
        $('#achatMaisons').dialog({
            autoOpen: false,
            title: "Achat de maisons /ea hetels",
            width: 500,
            height: 300
        });
        // Panneau d'enchere
        GestionEnchereDisplayer.init('idEncherePanel');
		
		$('#idTerrainsLibres').dialog({
			autoOpen:false,
			title:"Liste des terrains libre",
			width:350,
			height:300,
			buttons:[{text:'Fermer',click:function(){$('#idTerrainsLibres').dialog('close');}}],
			open:function(){showFreeTerrains();}
		});
    }
	
	/* Recupere la liste des plateaux disponibles */
	function loadListPlateaux(callback){
		$.ajax({
			url:'data/plateaux.json',
			dataType:'json',
			success:function(data){
				if(data == null || data.plateaux == null){return;}
				callback(data.plateaux);
			}
		});
	}
	
	function showListPlateaux(plateaux){
		for(var i = 0 ; i < plateaux.length ; i++){
			$('#idSelectPlateau').append('<option value="' + plateaux[i].url + '">' + plateaux[i].name + '</option>');
		}
	}
	
	function showFreeTerrains(){
		$('#idTerrainsLibres').empty();
		var it = GestionFiche.getTerrainsLibres();
		while(it.hasNext()){
			var t = it.next();
			$('#idTerrainsLibres').append('<div style="font-weight:bold;color:' + t.color + '">' + t.nom + '</div>');
		}
	}

    function showCreatePanel() {
        var sauvegardes = Sauvegarde.findSauvegardes();
        if (sauvegardes.length > 0) {
            for (var i = 0; i < sauvegardes.length; i++) {
                $('#idSauvegardes').append('<option value="' + sauvegardes[i].value + '">' + sauvegardes[i].label + '</option>');
            }
            $('#idDeleteSauvegarde').unbind('click').bind('click', function () {
                var save = $('#idSauvegardes').val();
                if (save != "") {
                    if (confirm("Etes vous sur de vouloir supprimer cette sauvegarde : " + save)) {
                        Sauvegarde.delete(save);
                        $('#idSauvegardes > option:selected').remove();
                    }
                }
            });
            $('#idLoadSauvegarde').unbind('click').bind('click', function () {
                if ($('#idSauvegardes').val() != "") {
                    Sauvegarde.load($('#idSauvegardes').val());
                    $('#idPanelCreatePartie').dialog('close');
                }
            });
        }

        $('#idPanelCreatePartie').dialog({
            title: "Monopoly",
            closeOnEscape: false,
            modal: true,
            width: 400,
            buttons: [{
                text: "Valider",
                click: createPanelGame
            }]
        });
    }

    function createPanelGame() {
        /* Chargement d'une partie */
        if ($('#idSauvegardes').val() != "") {
            Sauvegarde.load($('#idSauvegardes').val());
			$('#idPanelCreatePartie').dialog('close');
        } else {
			initPlateau($('#idSelectPlateau').val(),function(){
				var nb = $('select[name="nbPlayers"]', '#idPanelCreatePartie').val();
				var firstPlayerIA = $(':checkbox[name="firstIA"]:checked', '#idPanelCreatePartie').length > 0;
				var waitTimeIA = $('select[name="waitTimeIA"]', '#idPanelCreatePartie').val();
				/* Variantes */
				$(':checkbox[name]', '#idVariantes').each(function () {
					VARIANTES[$(this).attr('name')] = $(this).is(':checked');
				});
				createGame(nb, firstPlayerIA, {
					waitTimeIA: waitTimeIA,
					joueur:$('#idNomJoueur').val()
				});
			});
            $('#idPanelCreatePartie').dialog('close');
        }        
    }
	
    function createGame(nbPlayers, firstPlayerIA, options) {
        for (var i = 0; i < nbPlayers; i++) {
			var nom = "Joueur " + (i+1);
			if(i == 0 && !firstPlayerIA && options.joueur!=""){
				nom = options.joueur;
			}else{
				if(nomsJoueurs!=null && nomsJoueurs.length > 0){
					nom = nomsJoueurs[i];
				}
			}
			var joueur = createJoueur(i > 0 || firstPlayerIA, i,nom);
            joueurs[i] = joueur;
        }
        changeJoueur();
        initToolTipJoueur();

        /* Gestion des options */
        IA_TIMEOUT = options.waitTimeIA || IA_TIMEOUT;

    }

    function initToolTipJoueur() {

        $('.info-joueur').tooltip({
            content: function () {
                var stats = getJoueurById($(this).data('idjoueur')).getStats();
                $('span[name]', '#infoJoueur').each(function () {
                    $(this).html(stats[$(this).attr('name')]);
                });
                return $('#infoJoueur').html();
            }
        });
        // Panneau d'echange
        EchangeDisplayer.init('idPanelEchange', 'idSelectJoueurs', 'idListTerrainsJoueur', 'idListTerrainsAdversaire');
        CommunicationDisplayer.init('idCommunicationEchange');
    }

    function createJoueur(isRobot, i, nom) {
        var id = 'joueur' + i;
        var joueur = null;
        var color = colorsJoueurs[i];
        if (isRobot) {
            joueur = new JoueurOrdinateur(i, nom, color);
        } else {
            joueur = new Joueur(i, nom, color);
        }
		var div = $('<div id=\"' + id + '\"><div class="joueur-bloc"><span class="joueur-name">' + joueur.nom + '</span> : <span class="compte-banque"></span> ' + CURRENCY + '<span class="info-joueur" title="Info joueur" data-idjoueur="' + i + '"><img src="img/info-user2.png" style="cursor:pointer;width:24px;float:right"/></span></div></div><hr/>');
		if(i%2 == 0 && window.innerWidth > 1350){
			$('#informations-left').append(div);;
		}
		else{
			$('#informations').append(div);
		}
		
        joueur.setDiv($('#' + id));
        joueur.setPion(color);
        // On defini la couleurs
        $('#' + id + ' > div.joueur-bloc').css('backgroundImage', 'linear-gradient(to right,white 50%,' + color + ')');
        $.trigger('monopoly.newPlayer', {
            joueur: joueur
        });
        return joueur;
    }

    function reset() {
        $('#informations-left').empty();
        $('#informations').empty();
        joueurs = [];
    }

    function initJoueurs() {
        if (!DEBUG) {
            showCreatePanel();
        } else {
            createGame(2, false, {});
        }

    }

    // Initialise le plateau en chargeant les donnees dans le fichier
    function initPlateau(nomPlateau, callback) {
        // On charge le plateau
        $.ajax({
            url: 'data/' + nomPlateau,
            dataType: 'json',
            success: function (data) {
                if(data.plateau == null){
					throw "Erreur avec le plateau " + nomPlateau;
				}
				currentPlateauName = nomPlateau;
				// Gestion de l'heritage
				if(data.extend){
					// On charge l'autre plateau et on en etend
					$.ajax({
						url:'data/' + data.extend,
						dataType:'json',
						success:function(dataExtend){
							var extendedData = $.extend(true,{},dataExtend,data);							
							loadPlateau(extendedData,callback);
						}
					});
				}
				else{
					loadPlateau(data,callback);				
				}
            },
            error: function (a, b, c) {
				console.log(a,b,c);
                alert("Le plateau " + nomPlateau + " n'existe pas (" + 'data/' + nomPlateau + ")");
                return;
            }
        });

    }

	/* Charge les donnees du plateau */
	function loadPlateau(data,callback){
		plateau = data.plateau;
		if(plateau.type == 'circle'){
			DrawerFactory.setType('circle');
			$('.title').addClass('circle');
			$('#plateau').addClass('action-circle');
			$('#idSavePanel').arctext({radius: 80,dir:1})
			$('#idInfoBox').addClass('circle');
			$('#idInfoBox').unbind('mousewheel').bind('mousewheel',function(e,sens){
				var scroll=$('#idInfoBox').scrollTop() + (sens * e.deltaFactor * -0.7);
				$('#idInfoBox').scrollTop(scroll)
				e.preventDefault();
			});
		}
		
		GestionDes.init(plateau.rollColor);
		$('#idLancerDes').click(function(){
			GestionDes.lancer();
		});
		Drawer.add(DrawerFactory.getPlateau(0, 0, 800, 800, plateau.backgroundColor), 0); 				
		buildPlateau(data);
		Drawer.add(DrawerFactory.endPlateau(),2);
		Drawer.init(800, 800);

		if (callback) {
			callback();
		}
	}
	
    /* Construit le plateau a partir des donnees */
    function buildPlateau(data) {
        $('#idSubTitle').text(plateau.subtitle);
		parcGratuit = null;
        CURRENCY = data.currency;
        titles = data.titles;
		nomsJoueurs = plateau.nomsJoueurs || [];
        var colors = [];
        var groups = [];
        $(data.fiches).each(function () {
            var fiche = null;
            if (this.colors != null && this.colors.length > 0 && groups[this.colors[0]] == null) {
                groups[this.colors[0]] = new Groupe(this.groupe, this.colors[0]);
            }
            switch (this.type) {
            case "propriete":
                fiche = new Fiche(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers, this.prixMaison);
                groups[this.colors[0]].add(fiche);
                break;
            case "compagnie":
				fiche = new FicheCompagnie(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers,data.images[this.img]);
                groups[this.colors[0]].nom = 'Compagnie';
                groups[this.colors[0]].add(fiche);
                break;
            case "gare":
                fiche = new FicheGare(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers, data.images.gare);
                groups[this.colors[0]].nom = 'Gare';
                groups[this.colors[0]].add(fiche);
                break;
            case "chance":
                fiche = new Chance(this.axe, this.pos,data.images.chance);
                break;
            case "communaute":
                fiche = new CaisseDeCommunaute(this.axe, this.pos,data.images.caisseDeCommunaute);
                break;
            case "taxe":
                fiche = new CarteSpeciale(this.nom, this.prix, this.axe, this.pos, data.images.taxe || {
                    src: "img/bijou.png",
                    width: 40,
                    height: 50
                });
                break;
            case "prison":
                fiche = new CarteActionSpeciale(this.nom, function () {
                    joueurCourant.goPrison();
                }, this.axe, this.pos);
                break;
            case "special":
                fiche = new CarteActionSpeciale(this.nom, function () {
                    changeJoueur();
                }, this.axe, this.pos);
                break;
            case "parc":
                parcGratuit = new ParcGratuit(this.axe, this.pos);
                fiche = parcGratuit;
                break;
            case "depart":
                fiche = new CarteActionSpeciale(this.nom, function () {
                    if (VARIANTES.caseDepart) {
                        joueurCourant.gagner(40000)
                    } else {
                        joueurCourant.gagner(20000)
                    }
                    $.trigger('monopoly.depart', {
                        joueur: joueurCourant
                    });
                    changeJoueur();
                }, this.axe, this.pos);
                break;
            }
            GestionFiche.add(fiche);
            if (fiche.color != null) {
                if (colors[fiche.color] == null) {
                    // On genere un style
                    $('style', 'head').prepend('.color_' + fiche.color.substring(1) + '{color:white;font-weight:bold;background-color:' + fiche.color + ';}\n');
                    colors[fiche.color] = 1;
                }
            }
        });
        // On calcule les voisins de chaque groupe
        calculeVoisinsGroupes();

        // On charge les cartes chances et caisse de communaute
        if (data.chance) {
            $(data.chance.cartes).each(function () {
                var carte = buildCarteAction(this);
                if (carte != null) {
                    cartesChance.push(new CarteChance(this.nom, carte));
                }
            });
        }
        if (data.communaute) {
            $(data.communaute.cartes).each(function () {
                var carte = buildCarteAction(this);
                if (carte != null) {
                    cartesCaisseCommunaute.push(new CarteCaisseDeCommunaute(this.nom, carte));
                }
            });
        }		
    }

    /* Calcule les deux voisins (precedent / suivant) de chaque groupe. (utilisation : calcul de ligne) */
    /*  */
    function calculeVoisinsGroupes() {
        var currentGroupe = null;
        // Parcourt les fiches. On enregistre le groupe courant, quand changement, on defini le groupe precedent et calcule le suivant du precedent
        for (var i = 0; i < 42; i++) {
            var etat = Math.floor(i / 10) % 4;
            var pos = i % 40 - (etat * 10);
            var fiche = GestionFiche.get({
                axe: etat,
                pos: pos
            });
            if (fiche.groupe != null && fiche.constructible) {
                if (currentGroupe == null) {
                    // initialisation
                    currentGroupe = fiche.groupe;
                }
                if (!currentGroupe.equals(fiche.groupe)) { // Changement de groupe
                    fiche.groupe.groupePrecedent = currentGroupe;
                    currentGroupe.groupeSuivant = fiche.groupe;
                    currentGroupe = fiche.groupe;
                }
            }
        }
    }

    function buildCarteAction(data) {
        var carte = null;
        switch (data.type) {
            /* Amande a payer */
        case "taxe":
            carte = new PayerCarte(data.montant);
            break;
            /* Argent a toucher */
        case "prime":
            carte = new GagnerCarte(data.montant);
            break;
            /* Endroit ou aller */
        case "goto":
            carte = new GotoCarte(data.axe, data.pos, data.direct);
            break;
            /* Deplacement a effectuer */
        case "move":
            carte = new MoveNbCarte(data.nb);
            break;
            /* Carte prison */
        case "prison":
            carte = new PrisonCarte();
            break;
        }
        return carte;
    }

    function initDetailFiche() {
        var div = $('#fiche').clone();
        div.attr('id', 'idDetailFiche').hide();
        $('body').append(div);
    }

    function openDetailFiche(fiche, input) {
        if (currentFiche != null && currentFiche.etat == fiche.etat && currentFiche.pos == fiche.pos) {
            if ($('#idDetailFiche:visible').length == 0) {
                $('#idDetailFiche').slideDown();
            } else {
                $('#idDetailFiche').slideUp();
            }
            return;
        }
        if (currentFiche != null && (currentFiche.etat != fiche.etat || currentFiche.pos != fiche.pos)) {
            currentFiche = null;
            $('#idDetailFiche').slideUp(300, function () {
                openDetailFiche(fiche, input);
            });
            return;
        }
        //$('#idDetailFiche').width(280);
        loadDetailFiche(fiche);
        input.after($('#idDetailFiche'));
        $('#idDetailFiche').slideDown();
        currentFiche = fiche;
    }

    function closeDetailFiche() {
        $('#idDetailFiche').slideUp();
    }

var GestionTerrains = {
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
        if (banqueroute) {
            this.banqueroute = true;
        } else {
            this.banqueroute = false;
        }
        if (onclose) {
            this.panel.unbind('dialogbeforeclose').bind('dialogbeforeclose', onclose);
        } else {
            this.panel.unbind('dialogclose');
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
    init: function () {
        this.divArgentRestant = $('#idArgentRestant');
        this.divCout = $('#idCoutTotal');
        this.Hypotheque.init();
        this.LeverHypotheque.init();
        this.Constructions.init();
        this.panel = $('#housesPanel');
        this.panel.dialog({
            width: 800,
            height: 600,
            title: 'Gestion des maisons',
            modal: true,
            buttons: {
                'Fermer': function () {
                    $('#housesPanel').dialog('close');
                },
                "Valider": function () {
                    GestionTerrains.valider();
                }
            },
            autoOpen: false,
            open: function () {
                // On charge les proprietes a hypothequer
                GestionTerrains.load();
            }
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
        var totals = this.Constructions.update();
        this.divCout.text((this.cout - totals.cout) + " " + CURRENCY);
        this.totalRestant = joueurCourant.montant + this.cout - totals.cout;
        this.divArgentRestant.text((this.totalRestant) + " " + CURRENCY);
    },
    verify: function () {
        try {
            if (GestionTerrains.totalRestant < 0) {
                throw "Operation impossible : pas assez d'argent";
            }
            GestionTerrains.Constructions.verify();
        } catch (e) {
            createMessage("Attention", "red", e);
            return false;
        }
        return true;
    },
    valider: function () {
        if (!this.verify()) {
            return;
        }
        this.Hypotheque.valider();
        this.LeverHypotheque.valider();
        this.Constructions.valider();

        this.closePanel();
    },
    closePanel: function () {
        $('#housesPanel').dialog('close');
    },
    /* Gere l'hypotheque de terrain */
    Hypotheque: {
        table: [],
        select: null,
        div: null,
        init: function () {
            this.select = $('select', '#idTerrains');
            this.div = $('#toHypotheque');
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
            for (var id in this.table) {
                this.table[id].hypotheque();
            }
        },
        update: function () {
            $('option[data-color]', this.select).removeAttr('disabled');
            // On desactive les propriete qui ont des terrains construits
            var colors = GestionTerrains.Constructions.getGroupesConstruits();
            for (var i in colors) {
                $('option[data-color="' + colors[i] + '"]', this.select).attr('disabled', 'disabled');
            }
        },
        /* Charge les terrains hypothequables */
        load: function () {
            var proprietes = joueurCourant.findMaisonsHypothecables();
            $(proprietes).each(function () {
                GestionTerrains.Hypotheque.addOption(this);
            });
        },
        addGroup: function (group) {
            for (var index in group.proprietes) {
                this.addOption(group.proprietes[index]);
            }
        },
        addOption: function (fiche) {
            // On verifie si l'option n'existe pas
            if (this.select.find('option[value="' + fiche.id + '"]').length > 0) {
                return;
            }
            var option = $("<option data-color='" + fiche.color + "' value='" + fiche.id + "'>" + fiche.nom + " (+" + fiche.montantHypotheque + " " + CURRENCY + ")</option>");
            option.data("fiche", fiche);
            this.select.append(option);
        },
        /* Ajoute une propriete aux hypotheques */
        add: function () {
            var terrain = $('option:selected', this.select);
            var fiche = terrain.data("fiche");
            this.table[fiche.id] = fiche;
            var div = $('<div>' + fiche.nom + '</div>');
            var boutonAnnuler = $('<button style="margin-right:5px">Annuler</button>');
            var _self = this;
            boutonAnnuler.click(function () {
                _self.addOption(fiche);
                $(this).parent().remove();
                GestionTerrains.addCout(-fiche.montantHypotheque);
                delete _self.table[fiche.id];
                // On permet l'achat de maison sur les terrains si aucune maison hypotheque
                // On prend toutes les couleurs et on les elimine
                var colors = [];
                for (var id in _self.table) {
                    colors.push(_self.table[id].color.substring(1));
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
        init: function () {
            this.div = $('#idTerrainsHypotheques > div');
        },
        reset: function () {
            this.div.empty();
            this.table = [];
        },
        valider: function () {
            for (var id in this.table) {
                this.table[id].leveHypotheque();
            }
        },
        load: function () {
            var proprietes = joueurCourant.findMaisonsHypothequees();
            $(proprietes).each(function () {
                var fiche = this;
                var div = $("<div>" + this.nom + "</div>");
                var boutonLever = $('<button style="margin-right:5px">Lever</button>');
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
        init: function () {
            this.div = $('#idTerrainsConstructibles');
            this.infos = $('#coutAchats');
        },
        /* Verifie pour la validation et renvoie une exception */
        verify: function () {
            // On verifie les terrains libres
            var testGroups = [];
            $('select[data-color]', this.div).each(function () {
                var color = $(this).get(0).dataset.color;
                if (testGroups[color] == null) {
                    testGroups[color] = {
                        min: 5,
                        max: 0
                    };
                }
                testGroups[color].min = Math.min(testGroups[color].min, $(this).val());
                testGroups[color].max = Math.max(testGroups[color].max, $(this).val());
            });
            for (var color in testGroups) {
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
            for (var achat in this.table) {
                var data = this.table[achat];
                data.propriete.setNbMaison(data.nbMaison);
                joueurCourant.payer(data.cout);
            }
            // On modifie les quantites de maisons / hotels
            if (this.simulation != null && (this.simulation.achat.maison!=0 || this.simulation.achat.hotel!=0)) {
                GestionConstructions.buyHouses(this.simulation.achat.maison);
                GestionConstructions.buyHotels(this.simulation.achat.hotel);
                 $.trigger('monopoly.acheteConstructions', {
                    joueur: joueurCourant,
                    achats: this.simulation.achat
                });
            }
           

        },
        reset: function () {
            this.table = [];
            this.div.empty();
        },
        getGroupesConstruits: function () {
            var colors = [];
            $('select[data-color]:has(option:selected[value!=0])', this.div).each(function () {
                colors.push($(this).attr('data-color'));
            });
            return colors;
        },
        update: function () {
            var totals = {
                nbMaison: 0,
                nbHotel: 0,
                cout: 0
            };
            var projects = [];
            for (var achat in this.table) {
                var fiche = GestionFiche.getById(achat);
                var project = {
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
                var data = this.table[achat];
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
            $('span[name]', this.infos).each(function () {
                $(this).text(totals[$(this).attr('name')]);
            });
            /* Simulation d'achat (reste maison) */
            /* Il faut construire la situation avant / apres */
            this.simulation = GestionConstructions.simulateBuy(projects);
            $('span[name="nbMaison"]', '#resteConstructions').text(this.simulation.reste.maison);
            $('span[name="nbHotel"]', '#resteConstructions').text(this.simulation.reste.hotel);
            return totals;
        },
        /* Supprime la possibilite d'acheter des maisons sur les terrains de cette couleur */
        removeByColor: function (color) {
            this.div.find('div[class*="-' + color.substring(1) + '"]').hide();
        },
        showByColors: function (exludeColors) {
            var selectors = "div";
            for (var index in exludeColors) {
                selectors += ':not([class*="-' + exludeColors[index] + '"])';
            }
            this.div.find(selectors).show();
        },
        load: function () {
            var groups = joueurCourant.findGroupes();
            var table = $('#idTerrainsConstructibles');
            for (var color in groups) {
                var divTitre = $('<div style="cursor:pointer" class="group-' + color.substring(1) + '">Groupe <span style="color:' + color + ';font-weight:bold">' + groups[color].proprietes[0].groupe.nom + '</span></div>');
                divTitre.data("color", color.substring(1));
                divTitre.click(function () {
                    var id = 'div.propriete-' + $(this).data('color');
                    if ($(id + ':visible', this.div).length == 0) {
                        $(id, this.div).slideDown(); // On ouvre
                    } else {
                        $(id, this.div).slideUp();
                    }
                });
                this.div.append(divTitre);
                var group = groups[color];
                for (var index in group.proprietes) {
                    var propriete = groups[color].proprietes[index];
                    var divTerrain = $('<div class="propriete propriete-' + propriete.color.substring(1) + '"></div>');
                    divTerrain.append('<span style="color:' + propriete.color + '" class="title-propriete">' + propriete.nom + '</span>');
                    var select = $('<select data-color="' + propriete.color + '" class="' + ((propriete.nbMaison == 5) ? 'hotel' : 'maison') + '"></select>');
                    select.data("propriete", propriete);
                    select.data("group", group);
                    for (var j = 0; j <= ((GestionTerrains.banqueroute) ? propriete.nbMaison : 5); j++) {
                        select.append("<option class=\"" + ((j == 5) ? "hotel" : "maison") + "\" value=\"" + j + "\" " + ((propriete.nbMaison == j) ? "selected" : "") + ">x " + ((j == 5) ? 1 : j) + "</option>");
                    }
                    var _self = this;
                    select.change(function () {
                        var prop = $(this).data("propriete");
                        // On verifie changement par rapport a l'origine
                        if (prop.nbMaison == $(this).val()) {
                            delete _self.table[prop.id];
                            $('~span', this).text("");
                            GestionTerrains.update();
                            return;
                        }
                        var data = ($(this).val() == 5) ? {
                            hotel: 1
                        } : {
                            maison: parseInt($(this).val()) - prop.nbMaison
                        };
                        data.propriete = prop;
                        data.nbMaison = parseInt($(this).val());
                        data.cout = ($(this).val() > prop.nbMaison) ? ($(this).val() - prop.nbMaison) * prop.prixMaison : ($(this).val() - prop.nbMaison) * prop.prixMaison / 2;
                        $(this).removeClass().addClass(($(this).val() == 5) ? 'hotel' : 'maison');
                        $('~span', this).text(data.cout);
                        _self.table[prop.id] = data;
                        GestionTerrains.update();

                        // Si le groupe est vide, on permet l'hypotheque des terrains
                        var nbMaisons = 0;
                        var gr = $(this).data("group");
                        GestionTerrains.Constructions.div.find('select[data-color="' + prop.color + '"]').each(function () {
                            nbMaisons += parseInt($(this).val());
                        });
                        if (nbMaisons == 0) {
                            // Le groupe est hypothecable
                            GestionTerrains.Hypotheque.addGroup(gr);
                        }
                    });
                    divTerrain.append(select).append('<span></span> ' + CURRENCY);
                    $(this.div).append(divTerrain);
                }
            }
        }
    }
};

function loadFiche(fiche) {
    loadGenericFiche(fiche, $('#fiche'), 'FFFFFF');
    fiche.fiche.prev().css("background-color", fiche.color);
}

function loadDetailFiche(fiche) {
    loadGenericFiche(fiche, $('#idDetailFiche'), fiche.secondColor);
}

function loadGenericFiche(fiche, div, color) {
    $('td[name^="loyer"]', div).each(function () {
        $(this).text(fiche.loyer[parseInt($(this).attr('name').substring(5))]);
    });
    $('td[name]:not([name^="loyer"]),span[name]:not([name^="loyer"])', div).each(function () {
        $(this).html(fiche[$(this).attr('name')]);
    });
    $(div).css('backgroundColor', color);

    // Cas des gare
    if(fiche.type == 'gare'){
        $('#loyer0', div).text(parseInt(fiche.getLoyer()));
    }
    else{
        $('#loyer0', div).text((fiche.isGroupee() == true) ? parseInt(fiche.loyer[0]) * 2 : fiche.loyer[0]);
    }

    $('tr', div).removeClass("nbMaisons");
    $('.infos-group', div).removeClass("nbMaisons");
    $('#loyer' + fiche.nbMaison, div).parent().addClass("nbMaisons");
    if (fiche.nbMaison == 0 && fiche.isGroupee() == true) { // possede la serie
        $('.infos-group', div).addClass("nbMaisons");
    }
    if (fiche.type == 'gare') {
        $('.maison', div).hide();
    } else {
        $('.maison', div).show();
    }
}

function doCloseFiche() {
	if ($('#fiche').dialog('isOpen')) {
        $('#fiche').dialog('close');
    } else {
        if ($('#ficheCompagnie').dialog('isOpen')) {
            $('#ficheCompagnie').dialog('close');
        } else {
            closeFiche();
        }
    }
}

function initFiches() {
    $('#fiche').dialog({
        autoOpen: false,
        title: "Fiche",
        width: 280,
        height: 400,
        modal: true,
        resizable: false,
        close: function () {
			closeFiche();
        }
    });
    $('#fiche').prev().css("background", "url()");

    $('#ficheCompagnie').dialog({
        autoOpen: false,
        title: "Fiche",
        width: 280,
        height: 350,
        modal: true,
        resizable: false,
        close: function () {
            closeFiche();
        }
    });
    $('#ficheCompagnie').prev().css("background", "url()");
}

function selectJoueurCourant() {
    selectJoueur(joueurCourant);
}

function selectJoueur(joueur) {
    $('.action-joueur').removeAttr('disabled').removeClass('disabled');
	if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
	
	}
    if (!joueur.equals(joueurCourant)) {
        $('.joueurCourant').removeClass('joueurCourant');
		if(joueurCourant!=null){
			joueurCourant.pion.pion.setSelected(false);
		}
    }

    joueurCourant = joueur;
	joueurCourant.pion.pion.setSelected(true);
    joueur.select();
}

function getJoueurById(numero) {
    numero = parseInt(numero);
    for (var joueur in joueurs) {
        if (joueurs[joueur].numero == numero) {
            return joueurs[joueur];
        }
    }
    return null;
}

/* Affiche les echanges entre les joueurs */
var CommunicationDisplayer = {
    panel: null,
    joueur: null, // Joueur a qui est affiche le panneau
    init: function (idPanel) {
        this.panel = $('#' + idPanel);
        this.panel.dialog({
            autoOpen: false,
            title: 'Echange',
            width: 400
        });
    },
    /* Affiche la demande (recapitulatif). On affiche les options si on recoit la demande */
    show: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.showPropose(demandeur, proprietaire, terrain, proposition, displayJoueur);
        // On ajoute les actions
        this.addMessage("Que souhaitez vous faire", [{
            nom: "Accepter",
            action: function () {
                GestionEchange.accept(CommunicationDisplayer.joueur);
                CommunicationDisplayer.close();
            }
        }, {
            nom: "Refuser",
            action: function () {
                GestionEchange.reject(CommunicationDisplayer.joueur);
                CommunicationDisplayer.close();
            }
        }, {
            nom: "Négocier",
            action: function () {
                CommunicationDisplayer._showContrePanel(demandeur);
            }
        }], true)

    },
    /* Affiche juste la proposition, pas d'option */
    showPropose: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.joueur = displayJoueur;
        this.panel.dialog('option', 'title', 'Echange entre ' + demandeur.nom + ' et ' + proprietaire.nom);
        $('.proposition,.communications', this.panel).empty();
        $('.proposition', this.panel).append('<div>Terrain : <span style="font-weight:bold;color:' + terrain.color + '">' + terrain.nom + '</div>');

        this._showProposition($('.proposition', this.panel), proposition);
        $('.communications', this.panel).empty();
        this.panel.dialog('open');
    },
    /* Affiche le panneau de saisie d'une contreproposition */
    _showContrePanel: function (joueur, joueurAdverse) {
        // Affichage sur l'ecran principal ou le meme
        var groups = joueur.getMaisonsGrouped();
        var divProposition = $('<div class="contreProposition"></div>');
        for (var g in groups) {
            // ne pas affiche si construit )groups[g].isConstructed()
            var group = groups[g];
            var div = $('<div style="font-weight:bold;color:' + group.color + '">Groupe ' + group.groupe + '<br/></div>');
            for (var f in group.terrains) {
                var fiche = group.terrains[f];
                div.append('<input type="checkbox" value="' + fiche.id + '" id="chk_id_' + fiche.id + '"/><label for="chk_id_' + fiche.id + '">' + fiche.nom + '</label><br/>');
            }
            divProposition.append(div);
        }
        divProposition.append('Argent : <input class="argent" type="text"/>');
        $('.communications', this.panel).append(divProposition);
        this.addMessage("Quelle est votre contreproposition", [{
            nom: "Proposer",
            action: function () {
                CommunicationDisplayer._doContreproposition(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Rejeter",
            action: function () {
                GestionEchange.reject(CommunicationDisplayer.joueur);
                CommunicationDisplayer.close();
            }
        }], true)
    },
    _doContreproposition: function (joueur) {
        // On recupere les informations
        var proposition = {
            terrains: [],
            compensation: 0
        };
        $('.contreProposition:last :checkbox:checked', this.panel).each(function () {
            var terrain = GestionFiche.getById($(this).val());
            //var terrain = getFicheById($(this).val());
            if (terrain != null) {
                proposition.terrains.push(terrain);
            }
        });
        var argent = $('.contreProposition:last :text.argent', this.panel).val();
        if (argent != "") {
            proposition.compensation = parseInt(argent);
        }
        GestionEchange.contrePropose(proposition, joueur);
    },
    _showProposition: function (div, proposition) {
        div.append('Proposition : ');
        if (proposition.terrains.length > 0) {
            for (var t in proposition.terrains) {
                var terrain = proposition.terrains[t];
                div.append('<div style="padding-left:20px;color:' + terrain.color + '">' + terrain.nom + '</div>');
            }
        }
        div.append('<div style="padding-left:20px;">Argent : ' + CURRENCY + ' ' + proposition.compensation + '</div>');
    },
    /* Affiche la proposition acceptee */
    showAccept: function (callback) {
        this.addMessage("La proposition a été acceptée", [{
            nom: "Fermer",
            action: function () {
                CommunicationDisplayer.close();
                if (callback) {
                    callback();
                }
            }
        }]);
    },
    showReject: function (callback) {
        this.addMessage("La proposition a été rejetée", [{
            nom: "Fermer",
            action: function () {
                CommunicationDisplayer.close();
                if (callback) {
                    callback();
                }
            }
        }]);
    },
    showContreProposition: function (contreProposition) {
        this.addMessage("Une contreproposition a été faite", [{
            nom: "Refuser",
            action: function () {
                GestionEchange.reject(CommunicationDisplayer.joueur);
                CommunicationDisplayer.close();
            }
        }, {
            nom: "Accepter",
            action: function () {
                GestionEchange.accept(CommunicationDisplayer.joueur);
                CommunicationDisplayer.close();
            }
        }]);
        this._showProposition($('.communications', this.panel), contreProposition);
    },
    /* @param actions : beaucoup d'action a proposer au joueur */
    addMessage: function (message, actions, noHr) {
        if (!noHr) {
            $('.communications', this.panel).append('<hr/>');
        }
        $('.communications', this.panel).append('<p>' + message + '</p>');
        if (actions != null && actions.length > 0) {
            var buttons = [];
            for (var act in actions) {
                var action = actions[act];
                var button = {
                    text: action.nom,
                    click: action.action
                };
                buttons.push(button)
            }
            this.panel.dialog('option', 'buttons', buttons);
        }
    },
    close: function () {
        this.panel.dialog('close');
    }

}

var EchangeDisplayer = {
    panel: null,
    selectJoueurs: null,
    listTerrainsJoueur: null,
    listTerrainsAdversaire: null,
    joueur: null,
    init: function (id, idSelectJoueurs, idListTerrainsJoueur, idListTerrainsAdversaire) {
        this.panel = $('#' + id);
        this.selectJoueurs = $('#' + idSelectJoueurs);
        this.listTerrainsJoueur = $('#' + idListTerrainsJoueur);
        this.listTerrainsAdversaire = $('#' + idListTerrainsAdversaire);

        this.panel.dialog({
            title: "Echange de terrains",
            autoOpen: false,
            width: 400,
            buttons: {
                "Annuler": function () {
                    EchangeDisplayer.close();
                },
                "Proposer": function () {
                    EchangeDisplayer.propose();
                }
            }
        });
        // On charge les joueurs
        for (var j in joueurs) {
            this.selectJoueurs.append('<option value="' + joueurs[j].id + '">' + joueurs[j].nom + '</option>');
        }
        this.selectJoueurs.change(function () {
            $('option:not(:first),optgroup', EchangeDisplayer.listTerrainsAdversaire).remove();
            var joueur = getJoueurById(EchangeDisplayer.selectJoueurs.val());
            if (joueur != null) {
                var groups = joueur.getMaisonsGrouped();
                for (var g in groups) {
                    var group = groups[g];
                    var optionGroup = $('<optgroup label="Groupe ' + group.groupe + '" style="color:' + group.color + '"></optGroup>');
                    for (var f in group.terrains) {
                        var fiche = group.terrains[f];
                        optionGroup.append('<option value="' + fiche.id + '">' + fiche.nom + '</option>');
                    }
                    EchangeDisplayer.listTerrainsAdversaire.append(optionGroup);
                }
            }
        });
    },
    open: function (joueur) {
        this.joueur = joueur;
        // On cache le joueur qui a ouvert le panneau
        this.selectJoueurs.find('option:not(:visible)').show();
        this.selectJoueurs.find('option[value="' + joueur.id + '"]').hide();

        // Affichage des terrains du joueur
        this.listTerrainsJoueur.empty();
        var groups = joueur.getMaisonsGrouped();
        for (var g in groups) {
            // ne pas affiche si construit )groups[g].isConstructed()
            var group = groups[g];
            var div = $('<div style="font-weight:bold;color:' + group.color + '">Groupe ' + group.groupe + '<br/></div>');
            for (var f in group.terrains) {
                var fiche = group.terrains[f];
                div.append('<input type="checkbox" value="' + fiche.id + '" id="chk_id_' + fiche.id + '"/><label for="chk_id_' + fiche.id + '">' + fiche.nom + '</label><br/>');
            }
            EchangeDisplayer.listTerrainsJoueur.append(div);
        }
        this.panel.dialog('open');
    },
    propose: function () {
        var proprietaire = getJoueurById(EchangeDisplayer.selectJoueurs.val());
        var terrain = GestionFiche.getById(this.listTerrainsAdversaire.val());
        //var terrain = getFicheById(this.listTerrainsAdversaire.val());
        if (proprietaire == null || terrain == null) {
            return;
        }
        // L'action de fin, c'est la reprise du jeu par le joueur (donc rien)
        GestionEchange.init(this.joueur, proprietaire, terrain, null);
        // On recupere la proposition
        var proposition = {
            terrains: [],
            compensation: 0
        };
        $(':checkbox:checked', this.listTerrainsJoueur).each(function () {
            proposition.terrains.push(GestionFiche.getById($(this).val()));
            //proposition.terrains.push(getFicheById($(this).val()));
        });
        if ($('#idArgentProposition').val() != "") {
            proposition.compensation = parseInt($('#idArgentProposition').val());
        }
        this.close();
        CommunicationDisplayer.showPropose(this.joueur, proprietaire, terrain, proposition, this.joueur);
        GestionEchange.propose(proposition);
    },
    close: function () {
        this.panel.dialog('close');
        $('option', this.selectJoueurs).removeAttr('selected');
    }
}

var MessageDisplayer = {
    div: null,
    order: 0,
    init: function (id) {
        this.div = $('#' + id);
        this.bindEvents();
    },

    write: function (joueur, message) {
        MessageDisplayer.order++;
        var orderMessage = (DEBUG) ? (' (' + MessageDisplayer.order + ')') : '';
        this.div.prepend('<div><span style="color:' + joueur.color + '">' + joueur.nom + '</span> : ' + message + orderMessage + '</div>');
    },
    _buildTerrain: function (terrain) {
        return '<span style="font-weight:bold;color:' + terrain.color + '">' + terrain.nom + '</span>';
    },
    _buildProposition: function (proposition) {
        if (proposition == null) {
            return "";
        }
        var message = "";
        if (proposition.terrains.length > 0) {
            for (var i = 0; i < proposition.terrains.length; i++) {
                message += this._buildTerrain(proposition.terrains[i]) + ", ";
            }
        }
        if (proposition.compensation > 0) {
            message += " compensation : " + proposition.compensation + " " + CURRENCY;
        }
        return message;
    },
    bindEvents: function () {
        $.bind("monopoly.save", function (e, data) {
            MessageDisplayer.write({
                color: 'green',
                nom: 'info'
            }, 'sauvegarde de la partie (' + data.name + ')');
        }).bind("monopoly.depart", function (e, data) {
            MessageDisplayer.write(data.joueur, 's\'arrête sur la case départ');
        }).bind("monopoly.enchere.init", function (e, data) {
            MessageDisplayer.write(data.joueur != null ? data.joueur : {color:'black',nom:'La banque'}, 'met aux enchères ' + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.enchere.fail", function (e, data) {
            MessageDisplayer.write({
                    color: 'red',
                    nom: 'Commissaire priseur'
                },
                'le terrain ' + MessageDisplayer._buildTerrain(data.maison) + ' n\'a pas trouvé preneur');
        }).bind("monopoly.enchere.success", function (e, data) {
            MessageDisplayer.write(data.joueur, 'achète aux enchères le terrain ' + MessageDisplayer._buildTerrain(data.maison) + " pour " + CURRENCY + " " + data.montant);
        }).bind("monopoly.caissecommunaute.message", function (e, data) {
            MessageDisplayer.write(data.joueur, 'carte caisse de communauté : ' + data.message);
        }).bind("monopoly.chance.message", function (e, data) {
            MessageDisplayer.write(data.joueur, 'carte chance : ' + data.message);
        }).bind("monopoly.acheteMaison", function (e, data) {
            MessageDisplayer.write(data.joueur, 'achète ' + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.chezsoi", function (e, data) {
            MessageDisplayer.write(data.joueur, 'tombe sur ' + MessageDisplayer._buildTerrain(data.maison) + ". Il est chez lui.");
        }).bind("monopoly.visiteMaison", function (e, data) {
            MessageDisplayer.write(data.joueur, 'tombe sur ' + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.vendMaison", function (e, data) {
            MessageDisplayer.write(data.joueur, 'vends ' + data.nbMaison + ' maison(s)</span>');
        }).bind("monopoly.payerLoyer", function (e, data) {
            var mais = data.maison;
            var m = '<span style="font-weight:bold;color:' + mais.color + '">' + mais.nom + '</span>';
            var jp = '<span style="color:' + mais.joueurPossede.color + '">' + mais.joueurPossede.nom + '</span>';
            MessageDisplayer.write(data.joueur, "tombe sur " + m + " et paye " + mais.getLoyer() + " " + CURRENCY + " à " + jp);
        }).bind("monopoly.newPlayer", function (e, data) {
            MessageDisplayer.write(data.joueur, "rentre dans la partie");
        }).bind("monopoly.hypothequeMaison", function (e, data) {
            MessageDisplayer.write(data.joueur, 'hypothèque ' + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.leveHypothequeMaison", function (e, data) {
            MessageDisplayer.write(data.joueur, "lève l'hypothèque de " + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.goPrison", function (e, data) {
            MessageDisplayer.write(data.joueur, "va en prison");
        }).bind("monopoly.exitPrison", function (e, data) {
            MessageDisplayer.write(data.joueur, "sort de prison");
        }).bind("monopoly.acheteConstructions", function (e, data) {
            var message = "";
            var achats = data.achats;
            if (achats.maison > 0) {
                message += "achète " + achats.maison + " maison(s) ";
            } else {
                if (achats.maison < 0) {
                    message += "vend " + (achats.maison * -1) + " maison(s) ";
                }
            }
            if (achats.hotel > 0) {
                message += ((message != "") ? " et " : "") + "achète " + achats.hotel + " hôtel(s) ";
            } else {
                if (achats.hotel < 0) {
                    message += ((message != "") ? " et " : "") + "vend " + (achats.hotel * -1) + " hôtel(s) ";
                }
            }
			// On affiche la liste des terrains
			if(achats.terrains!=null && achats.terrains.size() > 0){
				message+=" sur ";
				for(var id in achats.terrains){
					message+=MessageDisplayer._buildTerrain(achats.terrains[id]) + ", ";
				}
			}
            if (message != "") {
                MessageDisplayer.write(data.joueur, message);
            }
        }).bind("monopoly.echange.init", function (e, data) {
            var message = 'souhaite obtenir ' + MessageDisplayer._buildTerrain(data.maison) + ' auprès de ' + data.maison.joueurPossede.nom;
            MessageDisplayer.write(data.joueur, message);
        }).bind("monopoly.echange.propose", function (e, data) {
            MessageDisplayer.write(data.joueur, 'propose : ' + MessageDisplayer._buildProposition(data.proposition));
        }).bind("monopoly.echange.accept", function (e, data) {
            MessageDisplayer.write(data.joueur, 'accepte la proposition');
        }).bind("monopoly.echange.reject", function (e, data) {
            MessageDisplayer.write(data.joueur, 'rejete la proposition');
        }).bind("monopoly.echange.contrepropose", function (e, data) {
            MessageDisplayer.write(data.joueur, 'fait une contre-proposition : ' + MessageDisplayer._buildProposition(data.proposition));
        }).bind("monopoly.defaite", function (e, data) {
            MessageDisplayer.write(data.joueur, 'a perdu et quitte la partie');
        }).bind("monopoly.victoire", function (e, data) {
            MessageDisplayer.write(data.joueur, 'a gagné la partie');
        }).bind("monopoly.debug", function (e, data) {
            if (DEBUG) {
                MessageDisplayer.write({
                    color: 'red',
                    nom: 'debug'
                }, data.message);
            }

        });
    }

}

/* Gere la sauvegarde */
var Sauvegarde = {
    prefix: "monopoly.",
    suffix: ".save",
    save: function (name) {
        if (name == null) {
            name = this.getSauvegardeName();
        }
        // On recupere la liste des joueurs
        var saveJoueurs = [];
        for (var j in joueurs) {
            if (joueurs[j].save != null) {
                saveJoueurs.push(joueurs[j].save());
                // On retient la position du joueur
            }
        }
        // On recupere la liste des fiches
        var saveFiches = [];
        var it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            saveFiches.push(it.next().save());
        }
        var data = {
            joueurs: saveJoueurs,
            fiches: saveFiches,
            joueurCourant: joueurCourant.id,
            variantes: VARIANTES,
            nbTours: nbTours,
			plateau:currentPlateauName
        };
        this._putStorage(name, data);
        $.trigger("monopoly.save", {
            name: name
        });
    },
    load: function (name) {
        currentSauvegardeName = name;
        var data = this._getStorage(name);
        reset();
		// On charge le plateau
		initPlateau(data.plateau || "data-monopoly.json",function(){
			for (var i = 0; i < data.joueurs.length; i++) {
				var joueur = createJoueur(!data.joueurs[i].canPlay, i,data.joueurs[i].nom);
				joueur.load(data.joueurs[i]);
				joueurs.push(joueur);
			}
			for (var i = 0; i < data.fiches.length; i++) {
				GestionFiche.getById(data.fiches[i].id).load(data.fiches[i]);
			}
			$.trigger('refreshPlateau');
			var joueur = joueurs[0];
			if (data.joueurCourant != null) {
				joueur = getJoueurById(data.joueurCourant);
			}
			VARIANTES = data.variantes || VARIANTES;
			nbTours = data.nbTours || 0;
			initToolTipJoueur();
			selectJoueur(joueur);
		});       
    },
    delete: function (name) {
        localStorage.removeItem(name);
    },
    _putStorage: function (name, data) {
        localStorage[name] = JSON.stringify(data);
    },
    _getStorage: function (name) {
        if (localStorage[name] == null) {
            throw "Aucune sauvegarde";
        }
        var data = localStorage[name];
        return JSON.parse(data);
    },
    autoSave: function () {

    },
    findSauvegardes: function () {
        var exp = "^" + this.prefix + "(.*)" + this.suffix + "$";
        var list = [];
        for (var name in localStorage) {
            var label = new RegExp(exp, "g").exec(name);
            if (label != null) {
                list.push({
                    value: name,
                    label: label[1]
                });
            }
        }
        return list;
    },
    getSauvegardeName: function (name) {
        return this.prefix + ((name == null) ? new Date().getTime() : name) + this.suffix;
    }

}

/* Gestion d'une mise aux enchere d'un terrain */
/* Empecher un joueur d'acquerir un terrain ? */
var GestionEnchere = {
    terrain: null,
    callback: null,
    miseDepart: 0,
    ventePerte: false,
    pasVente: 1000,
    joueurLastEnchere: null,
    lastEnchere: 0,
    nextMontantEnchere: 0,
    currentJeton: 0,
    joueursExit: [],
    endAckJoueurs: [], // Liste des joueurs ayant accuse de la fin des encheres
    transaction: 0, // Permet d'authentifier la transaction

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
        $.trigger('monopoly.enchere.init', {
            maison: this.terrain,
            joueur: this.terrain.joueurPossede
        });
        for (var j in joueurs) {
            joueurs[j].initEnchere(this.transaction, this.terrain, this.miseDepart);
        }
        this.runEnchere();
    },
    computeEncherisseurs: function () {
        var encherisseurs = [];
        var observers = [];
        // exclure les joueurs qui ont perdus
        for (var j in joueurs) {
            if (!joueurs[j].equals(this.terrain.joueurPossede) && !joueurs[j].equals(this.joueurLastEnchere) && this.joueursExit[joueurs[j].nom] == null) {
                encherisseurs.push(joueurs[j]);
            } else {
                observers.push(joueurs[j]);
            }
        }
        return {
            encherisseurs: encherisseurs,
            observers: observers
        };
    },
    /* On lance aux joueurs les encheres, le premier qui repond prend la main, on relance a chaque fois (et on invalide le resultat des autres) */
	/* @param newEnchere : quand l'enchere, on notifie les joueurs (ca peut les interesse) */
    runEnchere: function (newEnchere) {
        var joueurs = this.computeEncherisseurs();
        for (var i = 0; i < joueurs.encherisseurs.length; i++) {
            joueurs.encherisseurs[i].updateEnchere(this.transaction, this.currentJeton, this.nextMontantEnchere, this.joueurLastEnchere,newEnchere);
        }
        for (var i = 0; i < joueurs.observers.length; i++) {
            joueurs.observers[i].updateInfoEnchere(this.nextMontantEnchere, this.joueurLastEnchere);
        }
    },
    /* Appele par un joueur  */
    exitEnchere: function (joueur) {
		if(this.joueursExit[joueur.nom] != null){return;}
        this.joueursExit[joueur.nom] = joueur;
        for (var j in joueurs) {
            joueurs[j].notifyExitEnchere(joueur);
        }
        if (this.checkEndEnchere()) {
            this.manageEndEnchere();
        }
    },
	/* Verifie si l'enchere est terminee */
    checkEndEnchere: function () {
        // 1) Vente par banque, pas d'enchere
		// 2) Vente par joueur, pas d'enchere ou vente par banque avec une enchere
		// 3) Vente par joueur avec enchere
        if (this.joueursExit.size() >= joueurs.length || 
			(this.joueursExit.size() >= joueurs.length - 1 && (this.terrain.joueurPossede != null ||this.joueurLastEnchere !=null)) || 
			(this.joueursExit.size() >= joueurs.length - 2 && this.joueurLastEnchere != null && this.terrain.joueurPossede != null)
			) {
            return true;
        }
        return false;
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
            if (this.ventePerte && (this.nextMontantEnchere -  this.pasVente) > this.miseDepart / 2) {
                this.nextMontantEnchere -= this.pasVente;
				// On force les joueurs a reparticiper (le nouveau tarif peut interesser)
				this.joueursExit = [];
                this.runEnchere(true);
            } else {
                //pas de vente
                $.trigger('monopoly.enchere.fail', {
                    maison: this.terrain
                });
                this.endEnchere();
            }

        } else {
            // La mise aux encheres est terminee, on procede a l'echange
            // Correspond a un terrain
            if(this.terrain.joueurPossede == null){
				this.joueurLastEnchere.acheteMaison(this.terrain,this.lastEnchere);
            }
            else{
                this.joueurLastEnchere.payerTo(this.lastEnchere, this.terrain.joueurPossede);
                this.joueurLastEnchere.getSwapProperiete(this.terrain);
            }
            
            $.trigger('monopoly.enchere.success', {
                joueur: this.joueurLastEnchere,
                maison: this.terrain,
				montant:this.lastEnchere
            });

            this.endEnchere();
        }
    },
    endEnchere: function () {
        this.terrain = null;
        // On notifie les joueurs que c'est termine
        for (var j in joueurs) {
            joueurs[j].endEnchere(this.lastEnchere, this.joueurLastEnchere);
        }
    },
    /* Enregistre les joueurs qui accusent reception. Quand tous ont repondu, on lance le callback */
    checkEndNotify: function (joueur) {
        this.endAckJoueurs[joueur.numero] = true;
        if (this.endAckJoueurs.size() >= joueurs.length) {
            this.doCallback();
        }
    },
    doCallback: function () {
        if (this.callback) {
            this.callback();
        }
    }
}

var GestionEnchereDisplayer = {
    panel: null,
    currentMontant: 0,
    currentEncherisseur: null,
    terrain: null,
    displayer: null, // Joueur qui affiche le panneau
    init: function (id) {
        this.panel = $('#' + id);
        this.panel.dialog({
            title: 'Mise au enchere',
            autoOpen: false
        });
    },
    display: function (terrain, joueur) {
        this.terrain = terrain;
        this.displayer = joueur;
        $('.proprietaire', this.panel).text(terrain.joueurPossede !=null ? terrain.joueurPossede.nom : 'Banque');
        $('.terrain', this.panel).text(terrain.nom).css('color', terrain.color);
        $('.list_exit', this.panel).empty();
        $('.list_encherisseurs', this.panel).empty();
		$('.messages', this.panel).empty();
        this.panel.dialog('open');
    },
    /* Affiche l'option pour fermer le panneau */
    displayCloseOption: function (montant, joueur) {
        if (joueur != null) {
            // On affiche la victoire du joueur (derniere enchere faite)
            $('.montant', this.panel).text(montant);
            $('.montant', this.panel).css('color', 'green');
            $('.last_encherisseur', this.panel).text(joueur.nom);

            if (joueur.equals(this.displayer)) {
                // Message pour le joueur qui a remporte
                $('.messages', this.panel).append('Vous avez remporté l\'enchère');
            } else {
                $('.messages', this.panel).append(joueur.nom + ' a remporté l\'enchère');
            }
        } else {
            $('.montant', this.panel).css('color', 'red');
        }
        this.panel.dialog('option', 'buttons', [{
            text: 'Fermer',
            click: function () {
                GestionEnchereDisplayer.close();
            }
        }]);

    },
	/* Nettoie l'affichage */
	clean:function(){
		$('.list_exit', this.panel).empty();
	},
    /* Affiche le depart d'un joueur des encheres */
    showJoueurExit: function (joueur) {
        $('.list_exit', this.panel).append(joueur.nom + ' est sorti<br/>');
    },
    exitEnchere: function () {
        // On supprime les boutons
        this.panel.dialog('option', 'buttons', []);
    },
    close: function () {
        GestionEnchere.doCallback();
        this.panel.dialog('close');
    },
    /* Si canDoEnchere est vrai, le contexte doit etre present */
    updateInfo: function (montant, encherisseur, canDoEnchere, contexte) {
	    if (canDoEnchere && contexte == null) {
            throw "Impossible de gerer l'enchere";
        }
        if (this.currentMontant != null && this.currentEncherisseur != null) {
            $('.list_encherisseurs', this.panel).prepend('<p>' + CURRENCY + ' ' + this.currentMontant + ' : ' + this.currentEncherisseur.nom + '</p>');
            $('.list_encherisseurs > p:gt(3)', this.panel).remove();
        }
        this.currentMontant = montant;
        this.currentEncherisseur = encherisseur;

        $('.montant', this.panel).text(montant);
        $('.montant', this.panel).animate({
            color: 'red'
        }, 200).animate({
            color: 'black'
        }, 2000);
        if (encherisseur != null) {
            $('.last_encherisseur', this.panel).text(encherisseur.nom);
        }
        if (canDoEnchere) {
            // On affiche les boutons pour encherir ou quitter
            var buttons = [{
                text: 'Encherir',
                click: function () {
                    GestionEnchere.doEnchere(GestionEnchereDisplayer.displayer, montant, contexte.jeton);
                }
            }, {
                text: 'Quitter',
                click: function () {
                    GestionEnchere.exitEnchere(GestionEnchereDisplayer.displayer);
                }
            }];
            this.panel.dialog('option', 'buttons', buttons);
        } else {
            this.panel.dialog('option', 'buttons', []);
        }
    }
}

/*  Fonction utilitaire pour le debug */

/* Achete des maisons pour le joueur courant, on passe les ids de fiche */
function buy(maisons) {
	for (var i in maisons) {
		joueurCourant.acheteMaison(GestionFiche.getById(maisons[i]));
	}
}