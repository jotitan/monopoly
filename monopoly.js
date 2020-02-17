/* Gestion du Monopoly */

/* -- TODO : Echange uniquement quand tous les terrains sont vendus. La banque vend (quand on achete pas) ou quand un joueur perd */
/* -- TODO : plafonner argent a mettre dans une enchere (depend du prix de base). Encore trop cher (gare a 60K). Moins d'importance sur une gare */
/* -- TODO : integrer les contres sur les encheres (n'encherie que si la personne vraiment interesse pose une enchere */
/* -- TODO : changer strategie quand deux terrains du meme groupe. Ne pas les enchanger contre une merde */
/* TODO : Permettre l'achat de terrain hors strategie quand on est blinde et qu'on a deja des groupes et des constructions dessus */
/* TODO : proposer tout de même un terrain si deja une oldProposition */
/* TODO : pour contre propal, demander argent si besoin de construire */
/* TODO : Changer les couleurs du panneau d'achat de terrains */
/* TODO : pour echange, si argent dispo et adversaire dans la deche, on propose une grosse somme (si old proposition presente) */

var DEBUG = false;
var IA_TIMEOUT = 1000; // Temps d'attente pour les actions de l'ordinateur

/* Gestion des variantes, case depart (touche 40000) et parc gratuit (touche la somme des amendes) */
/* Conf classique : false,false,true,true */
let VARIANTES = {
	caseDepart: false, 		// Double la prime sur la case depart
	parcGratuit: false, 	// Toutes les taxes sont verses au parc gratuit
	enchereAchat: false, 	// Permet la mise aux encheres d'un terrain qu'un joueur ne veut pas acheter
	echangeApresVente: false,	// Permet d'echanger des terrains meme quand ils ne sont pas tous vendus
	desRapide:false,			// Jeu avec le des rapide
	tourAchat:false,             // Attendre un tour avant d'acheter
	quickMove:false	// Pour des deplacements tres rapide
}

/* Preconfiguration des variantes */
var configJeu = [
	{nom:"Classique strict",config:[false,false,true,true,false]},
	{nom:"Classique",config:[false,false,false,false,false]},
	{nom:"Variante 1",config:[true,true,false,false,false]}
];

var globalStats = {	// Statistiques
//var stats = {	// Statistiques
	nbTours:0,	// Nombre de tours de jeu depuis le depuis (nb de boucle de joueurs)
	heureDebut:new Date(),
	positions:[]
}

var CURRENCY = "F.";

class CarteActionWrapper{
	constructor(libelle,carte,title,color,triggerLabel){
		this.title = title;
		this.libelle = libelle;
		this.color = color;
		this.triggerLabel = triggerLabel;
		this.actionCarte = carte;
	}
	action (){
		return InfoMessage.create(GestionJoueur.getJoueurCourant(),this.title, this.color, this.libelle, ()=>{
			let name = `monopoly.${this.triggerLabel}.message`;
			$.trigger('event.network',{kind:'message',player:GestionJoueur.getJoueurCourant().id,libelle:this.libelle,name:name});
			$.trigger(name, {
				joueur: GestionJoueur.getJoueurCourant(),
				message: this.libelle
			});
			this.actionCarte.action(GestionJoueur.getJoueurCourant());
		}, {});
	}
}

class CarteChance extends CarteActionWrapper{
	constructor(libelle, carte) {
		super(libelle, carte, InitMonopoly.plateau.titles.chance, "lightblue", "chance");
	}
}

class CarteCaisseDeCommunaute extends CarteActionWrapper {
	constructor(libelle, carte) {
		super(libelle, carte, InitMonopoly.plateau.titles.communaute, "pink", "caissecommunaute");
	}
}

// Cree le comportement lorsque le joueur arrive sur la carte
function doActions(joueur=GestionJoueur.getJoueurCourant()) {
	let fiche = GestionFiche.getById(joueur.pion.axe + "-" + joueur.pion.position);
	if (fiche == null) {
		return GestionJoueur.change();
	}
	let buttons = fiche.action(); // Recupere les actions jouables en tombant sur cette case
	// une fois l'action cree, le joueur doit faire une action
	joueur.actionApresDes(buttons, fiche);
	// Notify end play
	$.trigger('move.end',{});
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
		Drawer.reset();
		GestionEnchereDisplayer.init('idEncherePanel');
		CommunicationDisplayer.init('idCommunicationEchange');
		GestionJoueur.init();
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
		$('.action-joueur').attr('disabled', 'disabled').addClass('disabled');
		if (!DEBUG) {
			this.showPanel();
		} else {
			this.plateau.load('data-monopoly.json',function(){InitMonopoly._createGame({}, {});});
		}
	},
	initSlider(id,min,value){
		$( `#${id}` ).slider({
			min:min,max:6,value:value,
			create: function() {
				this.handle = $('.ui-slider-handle',this);
				this.handle.text( $( this ).slider( "value" ) );
			},
			slide: function( event, ui ) {
				this.handle.text( ui.value );
			}
		});
	},
	plateau:{
		infos:null,
		titles:{},
		name:null,
		parcGratuit:null,
		cartes:{caisseCommunaute:[],chance:[]},
		drawing:null,
		load:function(nomPlateau,options,callback,dataExtend){
			this._temp_load_data = dataExtend;
			// On charge le plateau
			$.ajax({
				url: 'data/' + nomPlateau,
				dataType: 'json',
				context:this,
				success: (data) => {
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
						this._build(dataExtend,options,callback);
					}
				},
				error:() =>alert("Le plateau " + nomPlateau + " n'existe pas (" + 'data/' + nomPlateau + ")")
			});
		},
		loadVariantes:function(){
			$(':checkbox[name]', '#idVariantes').each(function () {
				// Si existe, ne surcharge pas
				if(VARIANTES[$(this).attr('name')] == null) {
					VARIANTES[$(this).attr('name')] = $(this).is(':checked');
				}
			});
		},
		// From monopoly plateau definition, create plateau
		_build:function(data,options,callback=()=>{}){
			this.infos = data.plateau;
			this.options = options;
			this.loadVariantes();

			DrawerFactory.setNbCases(this.infos.nbCases);
			DrawerFactory.addInfo('defaultImage',data.images.default || {});
			DrawerFactory.addInfo('textColor',this.infos.textColor || '#000000');
			DrawerFactory.addInfo('backgroundColor',this.infos.backgroundColor || '#FFFFFF');

			this.infos.argentJoueurDepart = this.infos.argent || 150000;
			this.infos.montantDepart =this.infos.depart || 20000;
			this.infos.montantPrison = this.infos.prison || 5000;

			if(this.infos.hideConstructions === true){
				$('.action-normal').hide();
			}else{
				$('.action-normal').show();
			}
			GestionJoueur.setColors(this.infos.colors);
			GestionJoueur.setImgJoueurs(this.infos.imgJoueurs);

			if(this.infos.type === 'circle'){
				this._configureCircle();
			}else{
				this.configureSquare();
			}
			CURRENCY = data.currency;
			this.titles = data.titles;
			this.infos.nomsJoueurs = this.infos.nomsJoueurs || [];

			GestionDes.gestionDes = this.isQuickDice() ? new GestionDesRapideImpl():new GestionDesImpl();
			GestionDes.init(this.infos.rollColor);
			let plateauSize = DrawerFactory.dimensions.plateauSize;
			$('#idLancerDes').unbind('click').bind('click',()=>GestionJoueur.lancerDes());
			this.drawing = DrawerFactory.getPlateau(0, 0, plateauSize, plateauSize, this.infos.backgroundColor);
			Drawer.add(this.drawing, 0);
			this._draw(data);
			Drawer.add(DrawerFactory.endPlateau(),2);
			Drawer.init(plateauSize, plateauSize);

			callback();
		},
		isQuickDice(){
			return this.options.typeGame === "quick";
		},
		_configureCircle(){
			DrawerFactory.setType('circle');
			$('.graphic_element,.title').addClass('circle');
			$('#idSavePanel').arctext({radius: 80,dir:1})
			$('#idSubTitle').hide();
			$('#idInfoBox').unbind('mousewheel').bind('mousewheel',function(e,sens){
				let scroll=$('#idInfoBox').scrollTop() + (sens * e.deltaFactor * -0.7);
				$('#idInfoBox').scrollTop(scroll);
				e.preventDefault();
			});
		},
		configureSquare(){
			DrawerFactory.setType('square');
			$('#idSavePanel').arctext({radius: -1,dir:1})
			$('.graphic_element,.title').removeClass('circle');
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
					case "propriete-junior":
						fiche = new FicheJunior(this.axe, this.pos, this.colors, this.nom, this.prix);
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
							let montant = (VARIANTES.caseDepart ? 2:1) * InitMonopoly.plateau.infos.montantDepart;
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
							$('style', 'head').prepend(`.color_${fiche.color.substring(1)}{color:white;font-weight:bold;background-color:${fiche.color};}\n`);
							colors[fiche.color] = 1;
						}
					}
				}
			});
			this._calculateVoisins(data.plateau.nbCases);

		},
		/* Calcule les voisins de chaque groupe */
		_calculateVoisins:function(nbCases = 10){
			var currentGroupe = null;
			let totalCases = nbCases * 4;
			// Parcourt les fiches. On enregistre le groupe courant, quand changement, on defini le groupe precedent et calcule le suivant du precedent
			for (var i = 0; i < totalCases +2; i++) {
				var axe = Math.floor(i / nbCases) % 4;
				var pos = i % totalCases - (axe * nbCases);
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
		this.initSlider('sliderJoueur',2,4);
		this.initSlider('sliderRobot',0,2);
		this._loadPlateaux();
		this._configSauvegardePanel();
		wrapDialog(this.panelPartie,{
			title: "Monopoly",
			closeOnEscape: false,
			modal: true,
			width: 400,
			position: { my: "center top", at: "center top", of: window },
			buttons: [{
				text: "Valider",
				click: function(){InitMonopoly._loadOrCreateGame();}
			}]
		})
	},
	_loadOrCreateGame:function(){
		// Network feature
		if($('#idCreationGame').tabs('option','active') === 1){
			return InitMonopoly.joinGame();
		}
		/* Chargement d'une partie */
		VARIANTES = {};
		if (this.listSauvegarde.val() !== "") {
			Sauvegarde.load(this.listSauvegarde.val());
		} else {
			let options = this._extractOptions();
			this.plateau.load($('#idSelectPlateau').val(),options,()=>InitMonopoly._createGame(options));
		}
		this.panelPartie.dialog('close');
	},
	_extractOptions(){
		var options = {
			nbRobots:$('#sliderRobot').slider('value'),
			nbPlayers:$('#sliderJoueur').slider('value')
		};
		$('#idPartie',this.panelPartie).find('select[name],:text[name]').each(function(){
			options[$(this).attr('name')] = $(this).val();
		});
		$('#idPartie',this.panelPartie).find(':checkbox[name]').each(function(){
			options[$(this).attr('name')] = $(this).is(':checked');
		});
		$('#idGameType',this.panelPartie).find(':radio:checked').each(function(){
			options[$(this).attr('name')] = $(this).val();
		});
		return options;
	},
	joinGame(){
		this._joinNetworkGame($('#idRemoteNomJoueur').val(),$('#idRemoteGame').val());
	},
	_joinNetworkGame(name,game){
		this.remoteManager = new RemoteManager(name,game);
		this.panelPartie.dialog('close');
	},
	// Create a network game as master
	_createNetworkGame(options){
		// Create game on server then load
		$.ajax({url:"/createGame"}).then((data)=> {
			this.remoteManager = new MasterRemoteManager(options.joueur,data.game);
			let players = this.remoteManager.create(options.nbPlayers,options.nbRobots,options.joueur,this.plateau.infos.nomsJoueurs);
			this.afterCreateGame(players);
		});
	},
	/* Creer la partie apres le chargement du plateau */
	_createGame:function(options){
		let j = $('#idNomJoueur').val() !== "" ? $('#idNomJoueur').val():"";
		options = $.extend({},{nbPlayers:0,nbRobots:0,waitTimeIA:1,joueur:j},options);
		if(options.networkGame === "true"){
			return this._createNetworkGame(options);
		}else{
			return this._createLocalGame(options);
		}
	},
	_createLocalGame(options){
		let playerNames = new Array(options.nbPlayers);
		for (let i = 0; i < options.nbPlayers; i++) {
			let nom = `Joueur ${i+1}`;
			if(i === 0 && options.joueur !== "" ){
				nom = options.joueur;
			}else{
				if(this.plateau.infos.nomsJoueurs.length > i){
					nom = this.plateau.infos.nomsJoueurs[i];
				}
			}
			playerNames[i] = nom;
			let isRobot = i >= options.nbPlayers - options.nbRobots;
			let clazzPlayer = isRobot ? JoueurFactory.getRobotPlayer():JoueurFactory.getCurrentPlayer()
			GestionJoueur.create(clazzPlayer, i,nom);
		}
		this.afterCreateGame(playerNames);
		GestionJoueur.change();

		/* Gestion des options */

		IA_TIMEOUT = VARIANTES.quickMove?10 : options.waitTimeIA || IA_TIMEOUT;
	},
	afterCreateGame:function(players=this.plateau.infos.nomJoueurs){
		this.plateau.infos.realNames=players;
		$('.info-joueur').tooltip({
			content: function () {
				let stats = GestionJoueur.getById($(this).data('idjoueur')).getStats();
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
		this.plateaux = $('#idSelectPlateau').empty();
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
		let sauvegardes = Sauvegarde.findSauvegardes();
		this.listSauvegarde = $('#idSauvegardes');
		$('option:not(:first)',this.listSauvegarde).remove();
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
		//$('#message').dialog({
		wrapDialog($('#message'),{
			autoOpen: false,
			position: { my: "center top", at: "center top", of: window },
		});
		$('#message').prev().css("background", "url()");
		/* Gestion de la sauvegarde */
		$('#idSavePanel').click(function () {
			var name = !Sauvegarde.isSauvegarde() ? prompt("Nom de la sauvegarde (si vide, defini par defaut)") : null;
			Sauvegarde.save(name);
		});
		// panneau d'achats de maisons
		//$('#achatMaisons').dialog({
		wrapDialog($('#achatMaisons'),{
			autoOpen: false,
			position: { my: "center top", at: "center top", of: window },
			title: "Achat de maisons /hotels",
			width: 500,
			height: 300
		});
		// Liste des terrains libres
		//$('#idTerrainsLibres').dialog({
		wrapDialog($('#idTerrainsLibres'),{
			autoOpen:false,
			position: { my: "center top", at: "center top", of: window },
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