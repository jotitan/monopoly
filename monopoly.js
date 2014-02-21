/* Gestion du Monopoly */

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
/* TODO : pour echange, si argent dispo et adversaire dans la deche, on propose une grosse somme (si old proposition presente) */

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
				axe= (axe + 3)%4;
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

   	function CarteAction(libelle,carte,title,color,triggerLabel){
		this.carte = carte;
		this.action = function(){
			return InfoMessage.create(GestionJoueur.getJoueurCourant(),title, color, libelle, function (param) {
                $.trigger('monopoly.' + triggerLabel + '.message', {
                    joueur: GestionJoueur.getJoueurCourant(),
                    message: libelle
                });
                carte.action(GestionJoueur.getJoueurCourant());
            }, {});
		}
	}
   
    function CarteChance(libelle, carte) {
		CarteAction.call(this,libelle,carte,titles.chance,"lightblue","chance");	   
    }

    function CarteCaisseDeCommunaute(libelle, carte) {
		CarteAction.call(this,libelle,carte,titles.communaute,"pink","caissecommunaute");	           
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
			if(i == 0 && !firstPlayerIA && options.joueur!=null && options.joueur!=""){
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
                var stats = GestionJoueur.getById($(this).data('idjoueur')).getStats();
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

    function reset() {
        $('#informations-left').empty();
        $('#informations').empty();
        joueurs = [];
    }

    function initJoueurs() {
        if (!DEBUG) {
            showCreatePanel();
        } else {
            initPlateau('data-monopoly.json',function(){createGame(2, false, {});});
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
/*  DEBUG */
/* Achete des maisons pour le joueur courant, on passe les ids de fiche */
function buy(maisons) {
	for (var i in maisons) {
		GestionJoueur.getJoueurCourant().acheteMaison(GestionFiche.getById(maisons[i]));
	}
}