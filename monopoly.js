/* Gestion du Monopoly */
/* Dependances a charger : */
/* * GestionConstructions.js */
/* * Graphics.js */
/* * SquareGraphics.js */
/* * CircleGraphics.js */

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
var colorsJoueurs = ["#383C89", "#A6193E", "#C58F01", "#086B3D", "#B9B29B","#663300"];

var CURRENCY = "F.";

var ETAT_LIBRE = 0;
var ETAT_ACHETE = 1;

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
	_calculateStrId:function(id){
		return parseInt(id.substr(0,1))*10 + parseInt(id.substr(2,3));
	},
	_calculateId:function(info){
		return info.axe*10 + info.pos;
	},
    getById: function (id) {
		return this.fiches[this._calculateStrId(id)];
        //return this.fiches[id];
    },
    get: function (info) {
		return this.fiches[this._calculateId(info)];
        //return this.fiches[info.axe + "-" + info.pos];
    },
    add: function (fiche) {
		var intId = this._calculateStrId(fiche.id);
		this.fiches[intId] = fiche;
		this.keys.push(intId);
        //this.fiches[fiche.id] = fiche;
        //this.keys.push(fiche.id);
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

    this.setMontant(0);
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




    
    function Pion(color, joueur) {
        this.etat = 2;
        this.position = 0;
        this.joueur = joueur;
        this.stats = {
            tour: 0,
            prison: 0
        }; // stat du joueur		
        this.pion = DrawerFactory.getPionJoueur(color,largeurPion);
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
			while(pos<0){
				pos+=10;
				axe= (axe - 1)%4;
			}
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
                message: GestionJoueur.getJoueurCourant().nom + " est en " + this.etat + "-" + this.position + " et va en " + id
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
			this.joueur.gagner(plateau.montantDepart || 20000);
        }    

        this.goDirectToCell = function (etat, pos, callback) {
			this.etat = etat;
			this.position = pos;
			this.pion.gotoDirect(etat,pos,callback);           
        }
    }

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

    function CarteChance(libelle, carte) {
        this.carte = carte;
        this.action = function (joueur) {
            return InfoMessage.create(GestionJoueur.getJoueurCourant(),titles.chance, "lightblue", libelle, function (param) {
                $.trigger('monopoly.chance.message', {
                    joueur: GestionJoueur.getJoueurCourant(),
                    message: libelle
                });
                carte.action(GestionJoueur.getJoueurCourant());
            }, {});
        }
    }

    function CarteCaisseDeCommunaute(libelle, carte) {
        this.carte = carte;
        this.action = function (joueur) {
            $.trigger('monopoly.caissecommunaute.message', {
                joueur: GestionJoueur.getJoueurCourant(),
                message: libelle
            });
            return InfoMessage.create(GestionJoueur.getJoueurCourant(),titles.communaute, "pink", libelle, function (param) {
                carte.action(GestionJoueur.getJoueurCourant());
            }, {});
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
            return InfoMessage.create(GestionJoueur.getJoueurCourant(),"Vous etes " + this.nom, this.color, "Vous etes chez vous", changeJoueur);
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
            //construireMaisons(true);
        }

        // Ouvre la fiche d'une propriete
        this.openFiche = function () {
            var buttons = this.getButtons();
            this.fiche.dialog('option', 'buttons', buttons);
            loadFiche(this);
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
                            GestionJoueur.getJoueurCourant().refuseMaison(current,doCloseFiche);
                        }
                    };
                } else {
                    return {
                        "Acheter": function () {
							var j = GestionJoueur.getJoueurCourant();
                            var id = j.pion.etat + "-" + j.pion.position;
                            j.acheteMaison(current);
                            doCloseFiche();
                        },
                        "Refuser": function () {
                            GestionJoueur.getJoueurCourant().refuseMaison(current,doCloseFiche);
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


    // Cree le comportement lorsque le joueur arrive sur la carte

    function doActions() {
        var fiche = GestionFiche.getById(GestionJoueur.getJoueurCourant().pion.etat + "-" + GestionJoueur.getJoueurCourant().pion.position);
        if (fiche == null) {
            GestionJoueur.change();
            return;
        }
        var buttons = fiche.action(); // Recupere les actions jouables en tombant sur cette case 
        // une fois l'action cree, le joueur doit faire une action
        GestionJoueur.getJoueurCourant().actionApresDes(buttons, fiche);
    }

    
    /* Gere les joueurs : creation, changement... */
	var GestionJoueur = {
		joueurs:[],
		joueurCourant:null,
		getJoueurCourant:function(){
			return this.joueurCourant;
		},
		create:function(isRobot, i, nom){
			var id = 'joueur' + i;			
			var color = colorsJoueurs[i];
			var joueur = isRobot ? new JoueurOrdinateur(i, nom, color) : joueur = new Joueur(i, nom, color);
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
			this.joueurs.push(joueur);
			joueurs.push(joueur);// TODO supprimer
			return joueur;    
		},
		getById:function(id){
			var numero = parseInt(id);
			for (var joueur in this.joueurs) {
				if (this.joueurs[joueur].numero == numero) {
					return this.joueurs[joueur];
				}
			}
			return null;
		},
		/* @param idInitialJoueur : si present, joueur qui debute */
		change:function(idInitialJoueur){
			if(idInitialJoueur!=null){
				var joueur = this.getById(idInitialJoueur);
				if(joueur!=null){
					return this._select(joueur);
				}
			}
			if(this.joueurCourant == null){
				// On prend le premier
				this._select(this.joueurs[0]);
			}
			// Si un echange est en cours, on ne change pas de joueur
			if (GestionEchange.running) {
				return;
			}
			// Joueur bloque, on le debloque avant de continuer
			var joueur = null;
			try {
				joueur = this.next();
			} catch (gagnant) {
				this._showVainqueur(gagnant);
				return gagnant;
			}
			if (joueur == null) {
				return null;
			}
			if(!GestionDes.isDouble()){
				GestionDes.resetDouble();
			}
			this._select(joueur);
			return null;
		},
		_showVainqueur:function(gagnant){
			$.trigger('monopoly.victoire',{joueur:gagnant});
			// On affiche les resultats complets
			var perdants = this.joueurs.filter(function(j){return j.defaite;});
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
			InfoMessage.create(this.joueurCourant,"Fin de partie", "green", message, null, null, true);
			//console.log("stats terrains",writePositions(stats.positions));
		},
		_select:function(joueur){
			$('.action-joueur').removeAttr('disabled').removeClass('disabled');
			if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
			
			}
			if (!joueur.equals(this.joueurCourant)) {
				$('.joueurCourant').removeClass('joueurCourant');
				if(this.joueurCourant!=null){
					this.joueurCourant.pion.pion.setSelected(false);
				}
			}

			this.joueurCourant = joueur;
			this.joueurCourant.pion.pion.setSelected(true);
			joueur.select();
		
		},
		getWinner:function() {
			var defaites = 0;
			var gagnantProbable;
			for (var index in this.joueurs) {
				if (this.joueurs[index].defaite == true) {
					defaites++;
				} else {
					gagnantProbable = this.joueurs[index];
				}
			}
			if (defaites == this.joueurs.length - 1) {
				return gagnantProbable;
			}
			return null;
		},
		next:function(){
			if (this.joueurCourant == null) {
				return this.joueurs[0];
			}
			// On verifie s'il y a encore des joueurs "vivants"
			if (this.joueurCourant.bloque) {
				return null;
			}
			var gagnant = getWinner();
			if (gagnant != null) {
				// On a un vainqueur
				throw gagnant;
			}
			var joueur = this.joueurCourant;
			/* Changement de joueur */
			if(!GestionDes.isDouble()){
				var pos = 0;
				joueur = this.joueurs[(joueur.numero + 1) % (this.joueurs.length)];
				while (joueur.defaite == true & pos++ < this.joueurs.length) {
					joueur = this.joueurs[(joueur.numero + 1) % (this.joueurs.length)];
				}
				// On incremente le nb de tours
				if (joueur.numero < this.joueurCourant.numero) {
					nbTours++;
					stats.nbTours++;
				}
			}
			return joueur;
		}
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
	
	function writePositions(){
		var str = "position;nb";
		for(var p in stats.positions){
			str += "\n" + p + ";" + stats.positions[p];
		}
		return str;
	}
	
    function closeFiche() {
        GestionJoueur.change();
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
			if (GestionJoueur.getJoueurCourant().enPrison) {
				// Propose au joueur de payer ou utiliser une carte
				var buttons = InfoMessage.createPrison(GestionJoueur.getJoueurCourant(),GestionJoueur.getJoueurCourant().nbDouble, function () {
					callback();
				});
				GestionJoueur.getJoueurCourant().actionAvantDesPrison(buttons);
			} else {
				callback();
			}
		},
		/* Cas lorsque le joueur est en prison */
		treatPrison:function(message){
			var j = GestionJoueur.getJoueurCourant();
			if (this.isDouble()) {
				MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + " et sort de prison");
				var buttons = InfoMessage.create(GestionJoueur.getJoueurCourant(),"Libere de prison", "lightblue", "Vous etes liberes de prison grace a un double", function () {
					GestionJoueur.getJoueurCourant().exitPrison();
					GestionDes.endLancer();
				}, {});
				GestionJoueur.getJoueurCourant().actionApresDes(buttons, null);
				return;
			} else {
				if (j.nbDouble == 2) {
					MessageDisplayer.write(j, message + " et sort de prison en payant " + CURRENCY + " 5.000");
					var buttons = InfoMessage.create(j,"Libere de prison", "lightblue", "Vous etes liberes de prison, mais vous devez payer " + CURRENCY + " 5.000 !", function () {
						j.payerParcGratuit(parcGratuit,5000, function () {
							j.exitPrison();
							GestionDes.endLancer();
						});
					}, {});
					j.actionApresDes(buttons, null);
					return;
				} else {
					MessageDisplayer.write(j, message + " et reste en prison");
					j.nbDouble++;
					var buttons = InfoMessage.create(j,"Tour " + j.nbDouble, "red", "Vous restez en prison, vous n'avez pas fait de double.", function () {
						GestionJoueur.change();
					}, {});
					j.actionApresDes(buttons, null);
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
			if (GestionJoueur.getJoueurCourant().enPrison == true) {
				this.treatPrison(message);
				return;
			} else {
				if (this.isDouble()) {
					if (this.nbDouble >= 2) {
						// Creer un message
						var buttons = InfoMessage.create(GestionJoueur.getJoueurCourant(),"Allez en prison", "red", "Vous avez fait 3 doubles, vous allez en prison", function () {
							MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + ", a fait 3 doubles et va en prison");
							$('#informationsCentrale').text("3eme double, allez en PRISON");
							// On met des valeurs differentes pour les des pour que le joueur ne rejoue pas
							GestionDes.des2++;
							// Le changement de joueur lorsque le deplacement est termine
							GestionJoueur.getJoueurCourant().goPrison();
						}, {});
						GestionJoueur.getJoueurCourant().actionApresDes(buttons, null);
						return;
					} else {
						this.nbDouble++;
						MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + " et rejoue");
					}
				}else{
					MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message);
				}
			}
			GestionDes.endLancer();
		},
		endLancer:function(){
			GestionJoueur.getJoueurCourant().joueDes(this.total());
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
		InfoMessage.init('message');
        initDetailFiche();
        initFiches();
        initPanels();
		initJoueurs();
        GestionTerrains.init({
			idArgentRestant:'#idArgentRestant',
			idCout:'#idCoutTotal',
			idPanel:'#housesPanel',
			idTerrains:'#idTerrains',
			idHypotheque:'#toHypotheque',
			idTerrainsHypotheque:'#idTerrainsHypotheques',
			idTerrainsConstructibles:'#idTerrainsConstructibles',
			idCoutAchat:'#coutAchats',
			idConstructions:'#resteConstructions'
		});
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
			GestionJoueur.create(i > 0 || firstPlayerIA, i,nom);            
        }
        GestionJoueur.change();
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
						},
						error:function(a,b,c){
							console.log(a,b,c);
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
		DrawerFactory.addInfo('defaultImage',data.images.default || {});
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
				fiche = new FicheCompagnie(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers,data.images[this.img] || data.images.compagnie);
                groups[this.colors[0]].nom = 'Compagnie';
                groups[this.colors[0]].add(fiche);
                break;
            case "gare":
                fiche = new FicheGare(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers, data.images.gare);
                groups[this.colors[0]].nom = 'Gare';
                groups[this.colors[0]].add(fiche);
                break;
            case "chance":
                fiche = new CaseChance(this.axe, this.pos,data.images.chance);
                break;
            case "communaute":
                fiche = new CaseCaisseDeCommunaute(this.axe, this.pos,data.images.caisseDeCommunaute);
                break;
            case "taxe":
                fiche = new SimpleCaseSpeciale(this.nom, this.prix, this.axe, this.pos, data.images.taxe);
                break;
            case "prison":
                fiche = new CaseActionSpeciale(this.nom, function () {
                    GestionJoueur.getJoueurCourant().goPrison();
                }, this.axe, this.pos);
                break;
            case "special":
                fiche = new CaseActionSpeciale(this.nom, function () {
                    GestionJoueur.change();
                }, this.axe, this.pos);
                break;
            case "parc":
                parcGratuit = new ParcGratuit(this.axe, this.pos);
                fiche = parcGratuit;
                break;
            case "depart":
                fiche = new CaseActionSpeciale(this.nom, function () {
                    if (VARIANTES.caseDepart) {
                        GestionJoueur.getJoueurCourant().gagner((data.plateau.montantDepart || 20000)*2);
                    } else {
                        GestionJoueur.getJoueurCourant().gagner(data.plateau.montantDepart || 20000);
                    }
                    $.trigger('monopoly.depart', {
                        joueur: GestionJoueur.getJoueurCourant()
                    });
                    GestionJoueur.change();
                }, this.axe, this.pos);
                break;
            }
            if(fiche!=null){
			GestionFiche.add(fiche);
				if (fiche.color != null) {
					if (colors[fiche.color] == null) {
						// On genere un style
						$('style', 'head').prepend('.color_' + fiche.color.substring(1) + '{color:white;font-weight:bold;background-color:' + fiche.color + ';}\n');
						colors[fiche.color] = 1;
					}
				}
			}
        });
        // On calcule les voisins de chaque groupe
        calculeVoisinsGroupes();

        // On charge les cartes chances et caisse de communaute
        if (data.chance) {
            $(data.chance.cartes).each(function () {
                var actionCarte = CarteActionFactory.get(this);
                if (actionCarte != null) {
                    cartesChance.push(new CarteChance(this.nom, actionCarte));
                }
            });
        }
        if (data.communaute) {
            $(data.communaute.cartes).each(function () {
                var actionCarte = CarteActionFactory.get(this);
                if (actionCarte != null) {
                    cartesCaisseCommunaute.push(new CarteCaisseDeCommunaute(this.nom, actionCarte));
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
            joueurCourant: GestionJoueur.getJoueurCourant().id,
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
				var joueur = GestionJoueur.create(!data.joueurs[i].canPlay, i,data.joueurs[i].nom);
				joueur.load(data.joueurs[i]);
				//joueurs.push(joueur);
			}
			for (var i = 0; i < data.fiches.length; i++) {
				GestionFiche.getById(data.fiches[i].id).load(data.fiches[i]);
			}
			$.trigger('refreshPlateau');
			VARIANTES = data.variantes || VARIANTES;
			nbTours = data.nbTours || 0;
			initToolTipJoueur();
			
			GestionJoueur.change(data.joueurCourant);			
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
		GestionJoueur.getJoueurCourant().acheteMaison(GestionFiche.getById(maisons[i]));
	}
}