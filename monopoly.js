/* Gestion du Monopoly */

/* -- TODO : Echange uniquement quand tous les terrains sont vendus. La banque vend (quand on achete pas) ou quand un joueur perd */
/* -- TODO : plafonner argent a mettre dans une enchere (depend du prix de base). Encore trop cher (gare a 60K). Moins d'importance sur une gare */
/* -- TODO : integrer les contres sur les encheres (n'encherie que si la personne vraiment interesse pose une enchere */
/* -- TODO : changer strategie quand deux terrains du meme groupe. Ne pas les enchanger contre une merde */
/* TODO : Permettre l'achat de terrain hors strategie quand on est blinde et qu'on a deja des groupes et des constructions dessus */
/* TODO : proposer tout de même un terrain si deja une oldProposition */
/* TODO : pour contre propal, demander argent si besoin de construire */
/* BIG TODO : implementation du des rapide */
/* TODO : Changer les couleurs du panneau d'achat de terrains */
/* TODO : pour echange, si argent dispo et adversaire dans la deche, on propose une grosse somme (si old proposition presente) */

var DEBUG = false;
var IA_TIMEOUT = 1000; // Temps d'attente pour les actions de l'ordinateur

/* Gestion des variantes, case depart (touche 40000) et parc gratuit (touche la somme des amendes) */
/* Conf classique : false,false,true,true */
var VARIANTES = {
    caseDepart: false, 		// Double la prime sur la case depart
    parcGratuit: false, 	// Toutes les taxes sont verses au parc gratuit
    enchereAchat: false, 	// Permet la mise aux encheres d'un terrain qu'un joueur ne veut pas acheter
	echangeApresVente: false,	// Permet d'echanger des terrains meme quand ils ne sont pas tous vendus
	desRapide:false			// Jeu avec le des rapide
}

/* Preconfiguration des variantes */
var configJeu = [
	{nom:"Classique strict",config:[false,false,true,true]},
	{nom:"Classique",config:[false,false,false,false]},
	{nom:"Variante 1",config:[true,true,false,false]}
];

var stats = {	// Statistiques
	nbTours:0,	// Nombre de tours de jeu depuis le depuis (nb de boucle de joueurs)
	heureDebut:new Date(),
	positions:[]
}	

var CURRENCY = "F.";

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
	CarteAction.call(this,libelle,carte,InitMonopoly.plateau.titles.chance,"lightblue","chance");	   
}

function CarteCaisseDeCommunaute(libelle, carte) {
	CarteAction.call(this,libelle,carte,InitMonopoly.plateau.titles.communaute,"pink","caissecommunaute");	           
}

// Cree le comportement lorsque le joueur arrive sur la carte
function doActions() {
	var fiche = GestionFiche.getById(GestionJoueur.getJoueurCourant().pion.axe + "-" + GestionJoueur.getJoueurCourant().pion.position);
	if (fiche == null) {
		GestionJoueur.change();
		return;
	}
	var buttons = fiche.action(); // Recupere les actions jouables en tombant sur cette case 
	// une fois l'action cree, le joueur doit faire une action
	GestionJoueur.getJoueurCourant().actionApresDes(buttons, fiche);
}

var GestionDes = {
	gestionDes:null,

	init:function(rollColor){
		this.gestionDes.init(rollColor);
	},
	lancer:function(){
		this.gestionDes.lancer();
	},
	isDouble:function(){
		return this.gestionDes.isDouble();
	},
	resetDouble:function(){
		return this.gestionDes.resetDouble();
	}  ,
    total:function(){
        return this.gestionDes.total();
    }
}

function GestionDesImpl(){
	this.nbAnimation = 8;
	this.cube = {des1:null,des2:null};
	this.des1 = 0;
	this.des2 = 0;
	this.nbDouble = 0;	// Nombre de double de suite pour le joueur en cours
	this.rollColor = '#000000';
	this.init = function(rollColor){
		this._init(rollColor);
	}
	
	this._init = function(rollColor){
		this.cube.des1 = DrawerFactory.getDes(150, 200, 50);
		this.cube.des2 = DrawerFactory.getDes(210, 200, 50);
		Drawer.addRealTime(this.cube.des1);
		Drawer.addRealTime(this.cube.des2);
		
		this.rollColor = rollColor;
	}
	this.resetDouble = function(){
		this.nbDouble = 0;
	}
	this._rand = function(){
		return Math.round((Math.random() * 1000)) % 6 + 1;
	}
	/* Action avant le lancement du des */
	this.before = function(callback){
		if (GestionJoueur.getJoueurCourant().enPrison) {
			// Propose au joueur de payer ou utiliser une carte
			var buttons = InfoMessage.createPrison(GestionJoueur.getJoueurCourant(),GestionJoueur.getJoueurCourant().nbDouble, function () {
				callback();
			});
			GestionJoueur.getJoueurCourant().actionAvantDesPrison(buttons);
		} else {
			callback();
		}
	}
	/* Cas lorsque le joueur est en prison */
	this.treatPrison = function(message){
		var j = GestionJoueur.getJoueurCourant();
		var gd = this;
		if (this.isDouble()) {
			MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + " et sort de prison");
			var buttons = InfoMessage.create(GestionJoueur.getJoueurCourant(),"Libere de prison", "lightblue", "Vous etes liberes de prison grace a un double", function () {
				GestionJoueur.getJoueurCourant().exitPrison();
				gd.endLancer();
			}, {});
			GestionJoueur.getJoueurCourant().actionApresDes(buttons, null);
			return;
		} else {
			if (j.nbDouble == 2) {
				MessageDisplayer.write(j, message + " et sort de prison en payant " + CURRENCY + " 5.000");
				var buttons = InfoMessage.create(j,"Libere de prison", "lightblue", "Vous etes liberes de prison, mais vous devez payer " + CURRENCY + " 5.000 !", function () {
					j.payerParcGratuit(InitMonopoly.plateau.parcGratuit,5000, function () {
						j.exitPrison();
						gd.endLancer();
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
	}
	/* Action apres le lancement des des */
	/* Regle de gestion 
	 * 1 - Le joueur peut payer 5000 Frs ou utiliser une carte sortie de prison avant de lancer les des
	 * 2 : Le joueur fait un double ou a payer, il sort
	 * 3 - Le joueur atteint sont 3eme lancer, il paie
	 * 4 - Pas de double, il reste en prison
	 * */
	this.after = function(){
		var message = "lance les dés et fait " + (this.total()) + " (" + this.combinaisonDes() + ") ";        
		if (GestionJoueur.getJoueurCourant().enPrison == true) {
			this.treatPrison(message);
			return;
		} else {
			if (this.isDouble()) {
				if(!this.treatDouble(message)){
                    return; // Si 3 doubles, prison et on ne continue pas le deplacement du jeu
                };
			}else{
				MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message);
			}
		}
		this.endLancer();
	}
	
	/* Renvoie la combinaison des des */
	this.combinaisonDes = function(){
		return this.des1 + " et " + this.des2;
	}
	
	/* Gere le comportement des doubles */
	this.treatDouble = function(message){
		return this._doTreatDouble(message);
	}
	
	this._doTreatDouble = function(message){
		var gd = this;
		if (this.nbDouble >= 2) {
			var buttons = InfoMessage.create(GestionJoueur.getJoueurCourant(),"Allez en prison", "red", "Vous avez fait 3 doubles, vous allez en prison", function () {
				MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + ", a fait 3 doubles et va en prison");
				$('#informationsCentrale').text("3eme double, allez en PRISON");
				// On met des valeurs differentes pour les des pour que le joueur ne rejoue pas
				gd.des2++;
				// Le changement de joueur lorsque le deplacement est termine
				GestionJoueur.getJoueurCourant().goPrison();
			}, {});
			GestionJoueur.getJoueurCourant().actionApresDes(buttons, null);
			return false;
		} else {
			this.nbDouble++;
			MessageDisplayer.write(GestionJoueur.getJoueurCourant(), message + " et rejoue");
		}
        return true;
	}
	
	this.endLancer = function(){
		GestionJoueur.getJoueurCourant().joueDes(this.total());
		this.showReload();		
	}
	
	this.showReload = function(){
		if (this.isDouble()) {
			$('#idReloadDice').show();
		}else{
			$('#idReloadDice').hide();
		}
	}
	
	this.isDouble = function(){
		return this.des1 == this.des2;
	}
	this.isTriple = function(){
		return this.des1 == this.des2 && this.des2 == this.desRapide && this.des1 <=3;
	}
	/* lancement du des */
	this.lancer = function(){
		var gd = this;
		this.before(function(){
			gd._randDes();
            $('#idReloadDice').hide();
			gd._anime();
		});			
	}
	this._randDes = function(){
		this.des1 = this._rand();
		this.des2 = this._rand();		
	}
	this._anime = function(){
		$('.action-joueur').attr('disabled', 'disabled').addClass('disabled');   
		var nb = this.nbAnimation;
		var gd = this;
		var interval = setInterval(function () {
			if (nb-- < 0) {
				clearInterval(interval);
				gd._drawCubes(gd.des1,gd.des2,gd.desRapide);
				gd.after();
				return;
			}
			gd._drawCubes(gd._rand(),gd._rand(),gd._rand()%3+1,gd.rollColor);
		}, 100);
	}
	this._drawCubes = function(val1,val2,desRapide,color){
		this.cube.des1.setValue(val1, color);
		this.cube.des2.setValue(val2, color);		
	}
	/* Renvoie le total des dés */
	this.total = function(){
		return this.des1 + this.des2;        
	}		
}

/* Implementation pour le des rapide */
/* DES RAPIDE */
	/* Si le des fait 1, 2 ou 3, on ajoute le score au des */
	/* Si on obtient un triple, on se deplace ou l'on souhaite (IA : trouver meilleure case : terrain a acheter (finir un groupe), passer une zone a risque) */
	/* Si on obtient le bus, on utilise l'un ou l'autre des des ou les deux (IA : chercher la cause la plus avantageuse / moins risque (terrain interessant, loyer le moins cher)) */
	/* Si on obtient un Mr Monopoly, on se place sur la prochaine propriété vide. Si tout vendu, on se deplace sur la premiere */
	
function GestionDesRapideImpl(){
	GestionDesImpl.call(this);
	this.cube.desRapide=null;
	this.desRapide;
	
	this.init = function(rollColor){
		this._init(rollColor);
		this.cube.desRapide = DrawerFactory.getDesRapide(112, 210, 35);			
		Drawer.addRealTime(this.cube.desRapide);
	}
	
	this._randDes = function(){
		this.des1 = this._rand();
		this.des2 = this._rand();
		this.desRapide = this._rand();	
	}

    this.total = function(){
        var total = this.des1 + this.des2;
        if(!this.isDouble() && this._isValue()){
            total+=this.desRapide;
        }
        return total;
    }

	/* Renvoie la combinaison des des */
	this.combinaisonDes = function(){
        if(this._isMonopolyMan()){
            return "Mr Monopoly";
        }
		return this.des1 + ", " + this.des2 + " et " +
            ((this.desRapide == 4 || this.desRapide == 6)?" bus":this.desRapide);
	}
		
	// Cas du triple : double + des rapide avec le meme chiffre (1, 2 ou 3) => Joueur place son pion ou il veut
	// Cas du double : double + des rapide different. Seul le double est pris en compte => Double normal
	this.treatDouble = function(message){
		// Cas triple
		if(this.des1 == this.desRapide){
			GestionJoueur.getJoueurCourant().choisiCase(function(fiche){
				GestionJoueur.getJoueurCourant().joueSurCase(fiche);
				$.trigger('monopoly.derapide.triple',{joueur:GestionJoueur.getJoueurCourant(),maison:fiche});
			});
		}else{
			this._doTreatDouble(message);
		}
	}

    this.isTriple = function(){
        return this.isDouble() && this.desRapide == this.des1 && this.des1 < 4;
    }

	this.total = function(){
        if(!this.isDouble() && this._isMonopolyMan()){
            return 0;
        }
		var total = this.des1 + this.des2;
        if(this.desRapide < 4 && !this.isDouble()){
            total+=this.desRapide;
        }
        return total;
	}
	
	this._isBus = function(){
		return this.desRapide == 4 || this.desRapide == 6;
	}
	
	this._isMonopolyMan = function(){
		return this.desRapide == 5;
	}
	
	this._isValue = function(){
		return this.desRapide <=3;
	}
	/* Surcharge le comportement apres le lancer */
	this.endLancer = function(){
		this.showReload();
        if(this.isTriple()){    // Joueur a choisi la case
            return;
        }
		if(this.isDouble() || this._isValue()){
			GestionJoueur.getJoueurCourant().joueDes(this.total());
			return;
		}
		
		/* Cas du bus, le joueur choisi quel des il utilise */
		if(this._isBus()){
			GestionJoueur.getJoueurCourant().choisiDes(this.des1,this.des2,function(total){
				$.trigger('monopoly.derapide.bus',{joueur:GestionJoueur.getJoueurCourant(),total:total});
				GestionJoueur.getJoueurCourant().joueDes(total);
			});
		}
		if(this._isMonopolyMan()){
			var pos = GestionJoueur.getJoueurCourant().getPosition();
			var fiche = GestionFiche.isFreeFiches() ? GestionFiche.getNextFreeTerrain(pos) : GestionFiche.getNextTerrain(pos);
			$.trigger('monopoly.derapide.mrmonopoly',{joueur:GestionJoueur.getJoueurCourant(),maison:fiche});
			GestionJoueur.getJoueurCourant().joueSurCase(fiche);
		}				
	}
	
	this._drawCubes = function(val1,val2,desRapide,color){
		this.cube.des1.setValue(val1, color);
		this.cube.des2.setValue(val2, color);
		this.cube.desRapide.setValue(desRapide, color);		
	}
}

var InitMonopoly = {
	plateaux:null,
	listSauvegarde :null,
	panelPartie:null,
	plateauName:null,
	infoPlateau:null,
	init:function(debugValue){
		DEBUG = debugValue;
		this.panelPartie = $('#idPanelCreatePartie');
		MessageDisplayer.init('idInfoBox');
		InfoMessage.init('message');
		FicheDisplayer.init();
		this.initPanels();
		GestionEnchereDisplayer.init('idEncherePanel');
		CommunicationDisplayer.init('idCommunicationEchange');
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
		
		 if (!DEBUG) {
			this.showPanel();
		} else {
			this.plateau.load('data-monopoly.json',function(){InitMonopoly._createGame({}, {});});
		}
	},
	plateau:{
		infos:null,
		titles:{},
		name:null,
		parcGratuit:null,
		cartes:{caisseCommunaute:[],chance:[]},
		drawing:null,
		load:function(nomPlateau,callback,dataExtend){
			this._temp_load_data = dataExtend;
			// On charge le plateau
			$.ajax({
				url: 'data/' + nomPlateau,
				dataType: 'json',
				context:this,
				success: function (data) {
					this._temp_load_data;
					if(data.plateau == null){
						throw "Erreur avec le plateau " + nomPlateau;
					}
					this.name = nomPlateau;
					// Gestion de l'heritage
					var dataExtend = $.extend(true,{},data,this._temp_load_data || {});
					if(data.extend){
						this.load(data.extend,callback,dataExtend);						
					}
					else{
						this._build(dataExtend,callback);             
					}
				},
				error: function (a, b, c) {
					alert("Le plateau " + nomPlateau + " n'existe pas (" + 'data/' + nomPlateau + ")");
					return;
				}
			});
		},
		_build:function(data,callback){
            $(':checkbox[name]', '#idVariantes').each(function () {
				VARIANTES[$(this).attr('name')] = $(this).is(':checked');
			});
			this.infos = data.plateau;
			var plateauSize = DrawerFactory.dimensions.plateauSize;
			DrawerFactory.addInfo('defaultImage',data.images.default || {});
			DrawerFactory.addInfo('textColor',this.infos.textColor || '#000000');
			DrawerFactory.addInfo('backgroundColor',this.infos.backgroundColor || '#FFFFFF');
			this.infos.montantDepart = this.infos.depart || 20000;
			if(this.infos.colors){
				GestionJoueur.colorsJoueurs = this.infos.colors;
			}
			if(this.infos.imgJoueurs){
				GestionJoueur.imgJoueurs = this.infos.imgJoueurs;
			}
			
			if(this.infos.type == 'circle'){
				DrawerFactory.setType('circle');
				$('.graphic_element,.title').addClass('circle');
				$('#idSavePanel').arctext({radius: 80,dir:1})
                $('#idSubTitle').hide();
				$('#idInfoBox').unbind('mousewheel').bind('mousewheel',function(e,sens){
					var scroll=$('#idInfoBox').scrollTop() + (sens * e.deltaFactor * -0.7);
					$('#idInfoBox').scrollTop(scroll)
					e.preventDefault();
				});
			}				
			CURRENCY = data.currency;
			this.titles = data.titles;
			this.infos.nomsJoueurs = this.infos.nomsJoueurs || [];
			
			GestionDes.gestionDes = VARIANTES.desRapide ? new GestionDesRapideImpl():new GestionDesImpl();
			GestionDes.init(this.infos.rollColor);
			$('#idLancerDes').click(function(){
				GestionDes.lancer();
			});
			this.drawing = DrawerFactory.getPlateau(0, 0, plateauSize, plateauSize, this.infos.backgroundColor);
			Drawer.add(this.drawing, 0); 				
			this._draw(data);
			Drawer.add(DrawerFactory.endPlateau(),2);
			Drawer.init(plateauSize, plateauSize);

			if (callback) {
				callback();
			}
		},
		_buildCartes:function(data,Instance){				
			return data!=null ? data.cartes.map(function(c){
				return new Instance(c.nom, CarteActionFactory.get(c));					
			}):[];				
		},
		_draw:function(data){
			$('#idSubTitle').text(this.infos.subtitle);
			this.parcGratuit = null;				
			var colors = [];
			var groups = [];
			var _self = this;
			
			this.cartes.chance = this._buildCartes(data.chance,CarteChance);
			this.cartes.caisseCommunaute = this._buildCartes(data.communaute,CarteCaisseDeCommunaute);
							
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
					fiche = new CaseChance(this.axe, this.pos,data.images.chance,_self.cartes.chance);
					break;
				case "communaute":
					fiche = new CaseCaisseDeCommunaute(this.axe, this.pos,data.images.caisseDeCommunaute,_self.cartes.caisseCommunaute);
					break;
				case "taxe":
					fiche = new SimpleCaseSpeciale(this.nom, this.prix, this.axe, this.pos, "taxe",data.images.taxe);
					break;
				case "prison":
					fiche = new CaseActionSpeciale(this.nom, function () {
						GestionJoueur.getJoueurCourant().goPrison();
					}, this.axe, this.pos,"prison");
					break;
				case "special":
					fiche = new CaseActionSpeciale(this.nom, function () {
						GestionJoueur.change();
					}, this.axe, this.pos,"special");
					break;
				case "parc":
					_self.parcGratuit = new ParcGratuit(this.axe, this.pos);
					fiche = _self.parcGratuit;
					break;
				case "depart":
					fiche = new CaseActionSpeciale(this.nom, function () {
                        var montant = VARIANTES.caseDepart ? (InitMonopoly.plateau.infos.montantDepart)*2 : InitMonopoly.plateau.infos.montantDepart;
                        GestionJoueur.getJoueurCourant().gagner(montant);

						$.trigger('monopoly.depart', {
							joueur: GestionJoueur.getJoueurCourant(),
                            montant:montant
						});
						GestionJoueur.change();
					}, this.axe, this.pos,"depart");
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
			this._calculateVoisins();
				
		},
		/* Calcule les voisins de chaque groupe */
		_calculateVoisins:function(){
			var currentGroupe = null;
			// Parcourt les fiches. On enregistre le groupe courant, quand changement, on defini le groupe precedent et calcule le suivant du precedent
			for (var i = 0; i < 42; i++) {
				var axe = Math.floor(i / 10) % 4;
				var pos = i % 40 - (axe * 10);
				var fiche = GestionFiche.get({
					axe: axe,
					pos: pos
				});
				if (fiche.groupe != null && fiche.isTerrain()) {
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
		},
		enableMouse:function(callback){
			this.drawing.enableCaseDetect(callback);
		}
	},
	showPanel:function(){
		this._loadPlateaux();
		this._configSauvegardePanel();
		this.panelPartie.dialog({
			title: "Monopoly",
			closeOnEscape: false,
			modal: true,
			width: 400,
			buttons: [{
				text: "Valider",
				click: function(){InitMonopoly._loadOrCreateGame();}
			}]
		});
	},
	_loadOrCreateGame:function(){
		/* Chargement d'une partie */
		if (this.listSauvegarde.val() != "") {
			Sauvegarde.load(this.listSauvegarde.val());
			this.panelPartie.dialog('close');
		} else {
			this.plateau.load($('#idSelectPlateau').val(),function(){
				var options = {};
				$('#idPartie',this.panelPartie).find('select[name]').each(function(){
					options[$(this).attr('name')] = $(this).val();
				});
				$('#idPartie',this.panelPartie).find(':checkbox[name]').each(function(){
					options[$(this).attr('name')] = $(this).is(':checked');
				});
				
				InitMonopoly._createGame(options);
			});
			this.panelPartie.dialog('close');
		}
	},
	/* Creer la partie apres le chargement du plateau */
	_createGame:function(options){
		var j = this.plateau.infos.nomsJoueurs.length > 0 ? this.plateau.infos.nomsJoueurs[0] : "";
		options = $.extend({},{nbPlayers:0,nbRobots:0,waitTimeIA:1,joueur:j},options);

		for (var i = 0; i < options.nbPlayers; i++) {
			var nom = "Joueur " + (i+1);
			if(i == 0){
				nom = options.joueur;				
			}else{
				if(this.plateau.infos.nomsJoueurs.length > i){
					nom = this.plateau.infos.nomsJoueurs[i];
				}
			}
			GestionJoueur.create(i >= options.nbPlayers - options.nbRobots, i,nom);            
		}
		this.afterCreateGame();
		GestionJoueur.change();

		/* Gestion des options */
		IA_TIMEOUT = options.waitTimeIA || IA_TIMEOUT;		  
	},
	afterCreateGame:function(){
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
	},
	/* Charge les plateaux de jeu disponible */
	_loadPlateaux:function(){
		this.plateaux = $('#idSelectPlateau');
		$.ajax({
			url:'data/plateaux.json',
			dataType:'json',
			context:this,
			success:function(data){
				if(data == null || data.plateaux == null){return;}
				data.plateaux.forEach(function(p){
					this.plateaux.append('<option value="' + p.url + '">' + p.name + '</option>');
				},this);
			}
		});
	},
	_configSauvegardePanel:function(){
		var sauvegardes = Sauvegarde.findSauvegardes();
		this.listSauvegarde = $('#idSauvegardes');
		var _self = this;
		if (sauvegardes.length > 0) {
			sauvegardes.forEach(function(s){			
				this.listSauvegarde.append('<option value="' + s.value + '">' + s.label + '</option>');
			},this);
			$('#idDeleteSauvegarde').unbind('click').bind('click', function () {
				if ($('option:selected',_self.listSauvegarde).length > 0) {
					if (confirm("Etes vous sur de vouloir supprimer cette sauvegarde : " + _self.listSauvegarde.val())) {
						Sauvegarde.delete(_self.listSauvegarde.val());
						$('option:selected',_self.listSauvegarde).remove();
					}
				}
			});
			$('#idLoadSauvegarde').unbind('click').bind('click', function () {
				if (_self.listSauvegarde.val() != "") {
					Sauvegarde.load(_self.listSauvegarde.val());
					_self.panelPartie.dialog('close');
				}
			});
		}
	},		
	initPanels:function(){
		$('#message').dialog({
			autoOpen: false
		});
		$('#message').prev().css("background", "url()");
		/* Gestion de la sauvegarde */
		$('#idSavePanel').click(function () {
			var name = !Sauvegarde.isSauvegarde() ? prompt("Nom de la sauvegarde (si vide, defini par defaut)") : null;
			Sauvegarde.save(name);				
		});
		// panneau d'achats de maisons
		$('#achatMaisons').dialog({
			autoOpen: false,
			title: "Achat de maisons /hotels",
			width: 500,
			height: 300
		});
		// Liste des terrains libres
		$('#idTerrainsLibres').dialog({
			autoOpen:false,
			title:"Liste des terrains libre",
			width:350,
			height:300,
			buttons:[{text:'Fermer',click:function(){$('#idTerrainsLibres').dialog('close');}}],
			open:function(){InitMonopoly._showFreeTerrains();}
		});
	},
	_showFreeTerrains:function(){
		$('#idTerrainsLibres').empty();
		var it = GestionFiche.getTerrainsLibres();
		while(it.hasNext()){
			var t = it.next();
			$('#idTerrainsLibres').append('<div style="font-weight:bold;color:' + t.color + '">' + t.nom + '</div>');
		}
	}
}

/*  DEBUG */
/* Achete des maisons pour le joueur courant, on passe les ids de fiche */
function buy(maisons) {
	for (var i in maisons) {
		GestionJoueur.getJoueurCourant().acheteMaison(GestionFiche.getById(maisons[i]));
	}
}