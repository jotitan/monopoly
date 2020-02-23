/* Case du plateau */

var ETAT_LIBRE = 0;
var ETAT_ACHETE = 1;

class PlateauCase{
    constructor(axe,pos,type) {
		this.axe = axe;
		this.pos = pos;
		this.id = axe + "-" + pos;
		this.type = type;
	}

    isTerrain(){
        return this.type === "terrain";
    }

    isPropriete(){
        return this.type === "terrain" || this.type === "junior" || this.type === "gare" || this.type === "compagnie";
    }
}

/* Case representant le parc gratuit */
class ParcGratuit extends PlateauCase {
    constructor(axe, pos) {
		super(axe, pos, "parc");
		this.montant = null;
		this._titre = "Parc Gratuit";
		this.nom = this._titre;
		this.drawing = DrawerFactory.getCaseSpeciale(0, this._titre);
		Drawer.add(this.drawing);
		this.setMontant(0);
	}

    setMontant(montant) {
        this.montant = montant;
		this.drawing.titre = this._titre + ((this.montant > 0) ? "\n" + CURRENCY + " " + this.montant : "");
		$.trigger('refreshPlateau');
        $('#idMontantParc > span').text(this.montant);
    }

    payer (montant) {
		this.setMontant(this.montant + montant);
    }

    action() {
		var _self = this;
        return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Parc gratuit", "lightblue", "Vous gagnez " + this.montant + " " + CURRENCY, function (param) {
            param.joueur.gagner(param.montant);
            _self.setMontant(0);
            GestionJoueur.change();
        }, {
            joueur: GestionJoueur.getJoueurCourant(),
            montant: this.montant
        });
    }
}

class CaseActionSpeciale extends PlateauCase {
	constructor(titre, actionSpeciale, axe, pos,type) {
		super(axe, pos, type);
		this.titre = titre;
		this.nom = titre;
		this.actionSpeciale = actionSpeciale;
		this.drawing = DrawerFactory.getCaseSpeciale(axe, titre);
		Drawer.add(this.drawing);
	}

	action() {
		$.trigger('monopoly.visiteTerrain',{joueur:GestionJoueur.getJoueurCourant(),maison:{color:'black',nom:this.titre}});
		this.actionSpeciale();
	}
}

class CaseDepart extends CaseActionSpeciale {
	constructor(titre, axe, pos,montant) {
		super(titre,()=>this.actionSpe(),axe, pos, "depart");
		this.montant = montant;
	}

	actionSpe() {
		let montant = (VARIANTES.caseDepart ? 2:1) * this.montant;
		GestionJoueur.getJoueurCourant().gagner(montant);

		$.trigger('monopoly.depart', {
			joueur: GestionJoueur.getJoueurCourant(),
			montant:montant
		});
		GestionJoueur.change();
	}
}

 /* Case speciale, comme la taxe de luxe */
class SimpleCaseSpeciale extends PlateauCase {
    constructor(titre, montant, axe, pos, type, img, plateauMonopoly){
    	super(axe,pos,type);
		this.montant = montant;
		this.titre = titre;
		// Used to pay to parc gratuit if necessary
		this.plateauMonopoly = plateauMonopoly;
		this.drawing = DrawerFactory.getCase(pos, axe, null, titre, CURRENCY + " " + montant, img);
		Drawer.add(this.drawing);
	}

	action () {
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),this.titre, "lightblue", "Vous devez payer la somme de " + this.montant + " " + CURRENCY, param=> {
			param.joueur.payerParcGratuit(this.plateauMonopoly.parcGratuit,param.montant, function () {
				GestionJoueur.change();
			});
		}, {
			joueur: GestionJoueur.getJoueurCourant(),
			montant: this.montant
		});
	}
}

class CaseChance extends PlateauCase {
	constructor(axe, pos,img, cartes, longTitle,shortTitle='carte chance'){
		super(axe,pos,"carte");
		this.nom = shortTitle;
		this.cartes = cartes;
		this.drawing = DrawerFactory.getCase(pos, axe, null, longTitle, null, img);
		Drawer.add(this.drawing);
	}
    action() {
		if (this.cartes.length === 0) {
			throw "Aucune " + this.nom;
		}
		let randomValue = Math.round((Math.random() * 1000)) % (this.cartes.length);
		let c = this.cartes[randomValue];
		// On test si la carte est une carte sortie de prison est possedee par un joueur
		if (c.actionCarte.type === "prison" && !c.actionCarte.isLibre()) {
			// on prend la carte suivante
			c = this.cartes[(randomValue + 1) % (this.cartes.length)];
		}
		return c.action();
	}
}

class CaseCaisseDeCommunaute extends CaseChance {
    constructor(axe, pos, img, cartes,longTitle){
    	super(axe,pos,img,cartes,longTitle,"carte caisse de communauté");
	}
}

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
		return this.color === groupe.color;
	}

	this.getVoisins = function () {
		return [this.groupePrecedent, this.groupeSuivant];
	}

	this.isVoisin = function (groupe) {
		return (this.groupePrecedent != null && this.groupePrecedent.equals(groupe)) || (this.groupeSuivant != null && this.groupeSuivant.equals(groupe));
	}

	this.equals = function (groupe) {
		return this.color === groupe.color;
	}

	/* Ajoute une fiche au groupe (lors de l'init) */
	this.add = function (fiche) {
		this.fiches.push(fiche);
		fiche.groupe = this;
		return this;
	}

	/* Indique que tous les terrains appartiennent a la meme personne */
	this.isGroupee = function () {
		if (this.fiches == null || this.fiches.length === 0) {
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
		if (this.fiches == null || fiches.length === 0) {
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
		let sumAdversaires = 0;
		for (var i = 0; i < this.fiches.length; i++) {
			var f = this.fiches[i];
			if (f.statut === ETAT_LIBRE) {
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
					if(adversaires[f.joueurPossede.id] !== 1){
						sumAdversaires++;
					}
					adversaires[f.joueurPossede.id] = 1;
				}
			}
		}
		infos.nbAdversaires = sumAdversaires;
		return infos;
	}

	/* Renvoie le nombre de fiche dans le groupe */
	this.getNb = function () {
		return (this.fiches == null) ? 0 : this.fiches.length;
	}		
}

/* Represente un terrain TODO REFACTO */
class Fiche extends PlateauCase {
    constructor(axe, pos, colors, nom){
    	super(axe,pos,"terrain");
		this.nom = nom;
		this.groupe = null;
		this.color = colors[0];
		this.secondColor = (colors.length === 2) ? colors[1] : colors[0];

		this.statut = ETAT_LIBRE;
		this.joueurPossede = null;
		this.statutHypotheque = false;
		this.fiche = $('#fiche');
		this.nbMaison = 0; // Nombre de maison construite sur le terrain par le proprietaire
		this.hotel = false; // Si un hotel est present
		this.maisons = [];
		this.input = null; // Bouton
	}

	setCosts(achat,loyers,prixMaison,img){
		this.achat = achat;
		this.montantHypotheque = achat / 2;
		this.achatHypotheque = this.montantHypotheque * 1.1;
		this.loyer = loyers;
		this.loyerHotel = (loyers != null && loyers.length === 6) ? loyers[5] : 0;
		this.prixMaison = prixMaison;

		this.drawing = DrawerFactory.getCase(this.pos, this.axe, this.color, this.nom, CURRENCY + " " + achat,img);
		Drawer.add(this.drawing);

		return this;
	}

	equals(fiche) {
		if (fiche == null) {
			return false;
		}
		return this.id === fiche.id;
	}

	/* Renvoie l'etat courant du terrain (JSON) */
	save() {
		// On renvoie le statut, le proprio, le nombre de maison, le statut hypotheque
		return {
			id: this.id,
			statut: this.statut,
			joueur: ((this.joueurPossede != null) ? this.joueurPossede.id : null),
			nb: this.nbMaison,
			hypotheque: this.statutHypotheque
		};
	}

	getNbPropertiesOfType(){
		var nb = -1;
		for (var i = 0; i < this.joueurPossede.maisons.length; i++) {
			if (this.joueurPossede.maisons[i].type === this.type) {
				nb++;
			}
		}
		return nb;
	}

	load(data) {
		var joueur = data.joueur != null ? GestionJoueur.getById(data.joueur) : null;
		if (joueur != null) {
			this.setJoueurPossede(joueur,true);
			joueur._drawTitrePropriete(this);
		}
		this.id = data.id;
		this.statut = data.statut;
		this.setNbMaison(data.nb, true);
		// On deduit les quantites du gestionnaire
		if(data.nb > 0){
			if(data.nb === 5){
				GestionConstructions.buyHotels(1);
			}
			else{
				GestionConstructions.buyHouses(data.nb);
			}
		}
		this.statutHypotheque = data.hypotheque;
		if (this.statutHypotheque === true) {
			this.input.addClass('hypotheque');
		}
	}

	setJoueurPossede(joueur,noRefresh){
		this.joueurPossede = joueur;
		this.drawing.setJoueur(joueur);
		this.joueurPossede.maisons.push(this);
		this.joueurPossede.updateMaisonsByGroup();
		if(!noRefresh && $.trigger){
			$.trigger('refreshPlateau');
		}
	}
	
	vendu(joueur) {
		this.statut = ETAT_ACHETE;
		this.setJoueurPossede(joueur);
		if ($.trigger) {
			$.trigger("monopoly.acheteMaison", {
				joueur: joueur,
				maison: this
			});
		}
	}

	/* Le terrain est rendu (manque d'argent) */
	libere() {
		this.statut = ETAT_LIBRE;
		this.statutHypotheque = false;
		this.joueurPossede = null;
		this.drawing.setJoueur(null);
		this.setNbMaison(0, true);
		this.hotel = false;
		$.trigger('refreshPlateau');
	}

	/* Renvoie la rentabilite de la propriete. Se base sur le rapport entre le loyer de trois maisons et le prix d'achat d'une maison */
	getRentabilite() {
		var ponderation = 10; // Facteur pour nivelle le taux
		if (!this.isTerrain() || this.nbMaison >= 3) {
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
	getRentabiliteBrute() {
		return !this.isTerrain() ? 0 : this.loyer[3] / (this.achat + 3 * this.prixMaison);
	}

	/* Hypotheque le terrain */
	hypotheque() {
		if (this.input == null || this.statut !== ETAT_ACHETE || this.nbMaison > 0) {
			throw "Impossible d'hypothequer ce terrain";
		}
		this.joueurPossede.gagner(this.montantHypotheque);
		this.joueurPossede.notifyHypotheque(this);
		this.doHypotheque();
	}

	doHypotheque(){
		this.statutHypotheque = true;
		this.input.addClass('hypotheque');
		$.trigger('monopoly.hypothequeMaison', {
			joueur: this.joueurPossede,
			maison: this
		});
	}
	leveHypotheque() {
		if (this.input == null || this.statut !== ETAT_ACHETE || this.statutHypotheque === false) {
			return;
		}
		let cout = Math.round(this.achatHypotheque);
		if (this.joueurPossede.montant < cout) {
			throw "Impossible de lever l'hypotheque";
		}
		this.joueurPossede.payer(cout);
		this.notifyLeveHypotheque();
		this.doLeveHypotheque();
	}
	notifyLeveHypotheque(){}
	doLeveHypotheque(){
		this.statutHypotheque = false;
		this.input.removeClass('hypotheque');
		$.trigger('monopoly.leveHypothequeMaison', {
			joueur: this.joueurPossede,
			maison: this
		});
	}

	isLibre() {
		return this.statut === ETAT_LIBRE;
	}

	isConstructed() {
		return this.nbMaison > 0;
	}

	/* Modifie le nombre de maison sur le terrain */
	setNbMaison(nb, noRefresh) {
		this.nbMaison = nb;
		this.drawing.setNbMaison(nb);
		if (this.nbMaison === 5) {
			this.hotel = true;
		} else {
			this.hotel = false;
		}
		// Lancer un evenement pour rafraichir le plateau
		if (!noRefresh) {
			$.trigger('refreshPlateau');
		}
	}

	action() {
		this.fiche.dialog('option', 'title', this.nom);
		// si on est chez soi, on affiche pas
		if (this.joueurPossede != null && this.joueurPossede.equals(GestionJoueur.getJoueurCourant())) {
			return this.chezSoi();
		}
		if (this.joueurPossede != null && this.statutHypotheque === false) { // on doit payer un loyer
			return this.payerLoyer();
		}
        if(this.statutHypotheque === true){
            return GestionJoueur.change();
        }
		return this.openFiche();
	}

	chezSoi() {
		$.trigger('monopoly.chezsoi',{joueur:this.joueurPossede,maison:this});
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Vous etes " + this.nom, this.color, "Vous etes chez vous", function(){GestionJoueur.change()});
	}

	sellMaison(joueur, noRefresh) {
		if (joueur == null || !this.joueurPossede.equals(joueur) || this.nbMaison <= 0) {
			return false;
		}
		if (this.nbMaison === 5) {
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
	buyMaison (joueur, noRefresh) {
		if (joueur == null || !this.joueurPossede.equals(joueur) || this.nbMaison >= 5) {
			return;
		}
		// On verifie la dispo
		if ((this.nbMaison === 4 && !GestionConstructions.isFreeHotel()) || (this.nbMaison < 4 && !GestionConstructions.isFreeHouse())) {
			throw "Pas de construction disponible";

		}
		this.setNbMaison(this.nbMaison + 1, noRefresh);
		if (this.nbMaison === 5) {
			this.hotel = true;
			GestionConstructions.buyHotel();
		} else {
			GestionConstructions.buyHouse();
		}
	}

    /* Renvoie le montant du loyer pour ce joueur (0 s'il est proprietaire) */
    getLoyerFor (joueur){
        if(joueur.equals(this.joueurPossede)){
            return 0;
        }
        return this.getLoyer()
    }

	getLoyer() {
		if (this.statutHypotheque) {
			return 0;
		}
		if (this.hotel === true) {
			return this.loyerHotel;
		}
		if (this.nbMaison === 0 && this.isGroupee()) {
			return this.loyer[0] * 2;
		}
		return this.loyer[this.nbMaison];
	}

	payerLoyer() {
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Vous etes " + this.nom, this.color, "Vous etes chez " + this.joueurPossede.nom + " vous devez payez la somme de " + this.getLoyer() + " " + CURRENCY, function (param) {
			$.trigger('monopoly.payerLoyer', {
				joueur: param.joueurPaye,
				maison: param.maison
			});
			$.trigger('event.network',{kind:'loyer',player:GestionJoueur.getJoueurCourant().id,maison:GestionFiche.buildId(param.maison)});
			param.joueurPaye.payerTo(param.loyer, param.joueurLoyer);
		}, {
			loyer: this.getLoyer(),
			joueurPaye: GestionJoueur.getJoueurCourant(),
			joueurLoyer: this.joueurPossede,
			maison: this
		});
	}

	noArgent() {}

	// Ouvre la fiche d'une propriete
	openFiche() {
		var buttons = this.getButtons();
		this.fiche.dialog('option', 'buttons', buttons);
		FicheDisplayer.loadFiche(this);
		if (GestionJoueur.getJoueurCourant().canPlay) {
			wrapDialog(this.fiche,'open');
		}
		return buttons;
	}

	getButtons() {
    	var current = this;
		if (this.statut === ETAT_LIBRE) {
			if (GestionJoueur.getJoueurCourant().montant < this.achat) {
				return {
					"Pas assez d'argent": function () {
						GestionJoueur.getJoueurCourant().refuseMaison(current,()=>FicheDisplayer.closeFiche());
					}
				};
			} else {
				return {
					"Acheter": function () {
						var j = GestionJoueur.getJoueurCourant();
						j.acheteMaison(current);
						FicheDisplayer.closeFiche();
					},
					"Refuser": function () {
						GestionJoueur.getJoueurCourant().refuseMaison(current,function(){FicheDisplayer.closeFiche()});
					}
				};
			}
		} else {
			return {
				"Fermer": function () {
					FicheDisplayer.closeFiche();
				}
			};
		}
	}

	/* Renvoie vrai si le reste du groupe appartient au meme joueur.*/
	isGroupee() {
		return (this.groupe == null) ? false : this.groupe.isGroupee();
	}

	/* Renvoie vrai si le groupe est complet et construit */
	/* Renvoie vrai si le reste du groupe appartient au meme joueur.*/
	isGroupeeAndBuild() {
		if (this.joueurPossede === null) {
			return false;
		}
		// Renvoie les maisons constructibles (lorsque le groupe est complet)
		var l = this.joueurPossede.findMaisonsConstructibles();
		for (var i = 0; i < l.length; i++) {
			// Si la couleur apparait dans une propriete, le groupe est complet
			if (l[i].color === this.color && l[i].nbMaison > 0) {
				return true;
			}
		}
		return false;
	}
}

// Represent a case for junior game (no hypotheque, no builds...)
class FicheJunior extends Fiche {
	constructor(axe,pos,colors,nom){
		super(axe,pos,colors,nom);
		this.fiche = $('#ficheJunior');
		this.type = "junior";
	}
}

class FicheGare extends Fiche{
	constructor(axe, pos, color, nom){
		super (axe, pos, color, nom);
		this.type = "gare";
	}

	getLoyer() {
		if (this.joueurPossede != null) {
			let nb = this.getNbPropertiesOfType();
			return this.loyer[nb];
		}
		return 0;
	}
}

class FicheCompagnie extends Fiche {
	constructor(axe, pos, color, nom) {
		super( axe, pos, color, nom);
		this.fiche = $('#ficheCompagnie');
		this.type = "compagnie";
	}

	getLoyer() {
		var loyer = GestionDes.total();
		if (this.joueurPossede != null) {
			let nb = this.getNbPropertiesOfType();
			return this.loyer[nb] * loyer;
		}
		return this.loyer[0] * loyer;
	}
}

/* Permet de gerer les fiches */
var GestionFiche = {
    fiches: [],
    keys: [], // Cles des fiches
	buildId(fiche){
    	return fiche.axe + "-" + fiche.pos;
	},
	_calculateStrId:function(id){
		return parseInt(id.substr(0,1))*DrawerFactory.dimensions.nbCases + parseInt(id.substr(2,3));
	},
	_calculateId:function(info){
		return info.axe*DrawerFactory.dimensions.nbCases + info.pos;
	},
    getById: function (id) {
		return this.fiches[this._calculateStrId(id)];
    },
    get: function (info) {
		return this.fiches[this._calculateId(info)];
    },
	getPrison : function(){
		return this.fiches[this._calculateId({axe:1,pos:0})];
	},
	getDepart : function(){
		return this.fiches[this._calculateId({axe:2,pos:0})];
	},
    add: function (fiche) {
		var intId = this._calculateStrId(fiche.id);
		this.fiches[intId] = fiche;
		this.keys.push(intId);
    },
    /* Renvoie les terrains libres */
    getFreeFiches: function () {
        return this.fiches.filter(function(f){return f.statut === ETAT_LIBRE;});
    },
	/* Renvoie vrai s'il reste des terrains libres */
	isFreeFiches:function(){
        return this.fiches.some(function(f){return f.statut === ETAT_LIBRE;});
	},
	/* Renvoie le prochain terrain libre */
	getNextFreeTerrain:function(from){
		return this._getNextFiche(from,function(f){return f.isPropriete() && f.statut === ETAT_LIBRE;});
	},
	getNextTerrain:function(from){
		return this._getNextFiche(from,function(f){return f.isPropriete();});
	},
	// Return all groups with name and color
	getGroups:function(){
		let groups = [];
		this.fiches
			.filter(m=>m.groupe!=null)
			.forEach(m=>groups[m.groupe.nom]=m.groupe.color);
		return groups;
	},
	_getNextFiche:function(from,condition){
		var info = {position:from.pos,axe:from.axe};
		do{
			info = this.nextPos(info.axe,info.position);
			var fiche = this.get({axe:info.axe,pos:info.position});
			if(condition == null || condition(fiche)){
				return fiche;
			}		 
		}while(from.axe!==info.axe || from.pos!==info.position);
		return null;
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
            if (this.fiches[id].isPropriete()) {
                keys.push(id);
            }
        }
        return this._buildIterator(keys);
    },
    getTerrainsLibres: function () {
        var keys = [];
        for (var id in this.fiches) {
            if (this.fiches[id].isPropriete() && this.fiches[id].statut === ETAT_LIBRE) {
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
    nextPos: function (axe, position) {
        position++;
        if (position === 10) {
            axe = (axe + 1) % 4;
            position = 0;
        }
        return {
            "position": position,
            "axe": axe
        };
    }
};
