/* Case du plateau */

var ETAT_LIBRE = 0;
var ETAT_ACHETE = 1;

function CaseActionSpeciale(titre, actionSpeciale, etat, pos) {
	this.titre = titre;
	this.actionSpeciale = actionSpeciale;
	this.id = etat + "-" + pos;
	this.drawing = DrawerFactory.getCaseSpeciale(etat,titre);
	Drawer.add(this.drawing);

	this.action = function () {
		$.trigger('monopoly.visiteTerrain',{joueur:GestionJoueur.getJoueurCourant(),maison:{color:'black',nom:this.titre}});
		this.actionSpeciale();
	}
}


 /* Case speciale, comme la taxe de luxe */
function SimpleCaseSpeciale(titre, montant, etat, pos, img) {
	this.id = etat + "-" + pos;
	this.drawing = DrawerFactory.getCase(pos, etat, null, titre, CURRENCY + " " + montant, img);
	Drawer.add(this.drawing);
	this.action = function () {
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),titre, "lightblue", "Vous devez payer la somme de " + montant + " " + CURRENCY, function (param) {
			param.joueur.payerParcGratuit(parcGratuit,param.montant, function () {
				GestionJoueur.change();
			});
		}, {
			joueur: GestionJoueur.getJoueurCourant(),
			montant: montant
		});
	}
}

function CaseChance(etat, pos,img) {
	this.id = etat + "-" + pos;
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

function CaseCaisseDeCommunaute(etat, pos, img) {
	this.id = etat + "-" + pos;
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

/* Represente un terrain TODO REFACTO */
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

	this.setJoueurPossede = function(joueur,noRefresh){
		this.joueurPossede = joueur;
		this.drawing.setJoueur(joueur);
		this.joueurPossede.maisons.push(this);
		if(!noRefresh){
			$.trigger('refreshPlateau');
		}
	}
	
	this.vendu = function (joueur) {
		this.statut = ETAT_ACHETE;
		this.setJoueurPossede(joueur);
		
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
		this.drawing.setJoueur(null);
		this.setNbMaison(0, true);
		this.hotel = false;
		$.trigger('refreshPlateau');
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
		return !this.constructible ? 0 : this.loyer[3] / (this.achat + 3 * this.prixMaison);			
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
		if (this.joueurPossede != null && this.joueurPossede.equals(GestionJoueur.getJoueurCourant())) {
			return this.chezSoi();
		}
		if (this.joueurPossede != null && this.statutHypotheque == false) { // on doit payer un loyer
			return this.payerLoyer();
		}
		return this.openFiche();
	}

	this.chezSoi = function () {
		$.trigger('monopoly.chezsoi',{joueur:this.joueurPossede,maison:this});
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Vous etes " + this.nom, this.color, "Vous etes chez vous", function(){GestionJoueur.change()});
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
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Vous etes " + this.nom, this.color, "Vous etes chez " + this.joueurPossede.nom + " vous devez payez la somme de " + this.getLoyer() + " " + CURRENCY, function (param) {
			$.trigger('monopoly.payerLoyer', {
				joueur: param.joueurPaye,
				maison: param.maison
			});
			param.joueurPaye.payerTo(param.loyer, param.joueurLoyer);
		}, {
			loyer: this.getLoyer(),
			joueurPaye: GestionJoueur.getJoueurCourant(),
			joueurLoyer: this.joueurPossede,
			maison: this
		});
	}

	this.noArgent = function () {
		
	}

	// Ouvre la fiche d'une propriete
	this.openFiche = function () {
		var buttons = this.getButtons();
		this.fiche.dialog('option', 'buttons', buttons);
		FicheDisplayer.loadFiche(this);
		if (GestionJoueur.getJoueurCourant().canPlay) {
			this.fiche.dialog('open');
		}
		return buttons;
	}

	this.getButtons = function () {
		if (this.statut == ETAT_LIBRE) {
			if (GestionJoueur.getJoueurCourant().montant < this.achat) {
				return {
					"Pas assez d'argent": function () {
						GestionJoueur.getJoueurCourant().refuseMaison(current,function(){FicheDisplayer.closeFiche()});
					}
				};
			} else {
				return {
					"Acheter": function () {
						var j = GestionJoueur.getJoueurCourant();
						var id = j.pion.etat + "-" + j.pion.position;
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
	Fiche.call(this, etat, pos, color, nom, achat, loyers, null, img);
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
	Fiche.call(this, etat, pos, color, nom, achat, loyers, null,img);
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


/* Permet de gerer les fiches */
var GestionFiche = {
    fiches: [],
    keys: [], // Cles des fiches
	_calculateStrId:function(id){
		return parseInt(id.substr(0,1))*10 + parseInt(id.substr(2,3));
	},
	_calculateId:function(info){
		return info.axe*10 + info.pos;
	},
    getById: function (id) {
		return this.fiches[this._calculateStrId(id)];
    },
    get: function (info) {
		return this.fiches[this._calculateId(info)];
    },
    add: function (fiche) {
		var intId = this._calculateStrId(fiche.id);
		this.fiches[intId] = fiche;
		this.keys.push(intId);
    },
    /* Renvoie les terrains libres */
    getFreeFiches: function () {
        return this.fiches.filter(function(f){return f.statut == ETAT_LIBRE;});
    },
	/* Renvoie vrai s'il reste des terrains libres */
	isFreeFiches:function(){
        return this.fiches.some(function(f){return f.statut == ETAT_LIBRE;});		
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
