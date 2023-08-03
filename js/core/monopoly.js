import '../utils.js'
import {GestionJoueur, JoueurFactory} from './gestion_joueurs.js'
import {InfoMessage, MessageDisplayer} from '../display/message.js'
import {Drawer, DrawerFactory} from '../ui/graphics.js'
import {GestionTerrains} from './gestion_terrains.js'
import {GestionDes, GestionDesImpl, GestionDesRapideImpl} from '../entity/dices.js'
import {EchangeDisplayer, GestionEnchere, GestionEnchereDisplayer} from './enchere.js'
import {CarteActionFactory} from '../entity/cartes_action.js'
import {
    CaseActionSpeciale,
    CaseCaisseDeCommunaute,
    CaseChance,
    CaseDepart,
    Fiche,
    FicheCompagnie,
    FicheGare,
    FicheJunior,
    GestionFiche,
    Groupe,
    ParcGratuit,
    SimpleCaseSpeciale
} from '../display/case_jeu.js'
import {CommunicationDisplayer, FicheDisplayer, wrapDialog} from '../display/displayers.js'
import {checkExistingGame, MasterRemoteManager, RemoteManager} from '../entity/network/remote_manager.js'
import '../ui/square_graphics.js';
import '../ui/circle_graphics.js';
import {Sauvegarde} from '../sauvegarde.js';
import {createGameRequest, get, loadAllPlateaux} from "../request_service.js";
import {bus} from "../bus_message.js";

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

let DEBUG = false;
let IA_TIMEOUT = 100; // Temps d'attente pour les actions de l'ordinateur

/* Gestion des variantes, case depart (touche 40000) et parc gratuit (touche la somme des amendes) */
/* Conf classique : false,false,true,true */
let VARIANTES = {
    caseDepart: false, 		// Double la prime sur la case depart
    parcGratuit: false, 	// Toutes les taxes sont verses au parc gratuit
    enchereAchat: false, 	// Permet la mise aux encheres d'un terrain qu'un joueur ne veut pas acheter
    echangeApresVente: false,	// Permet d'echanger des terrains meme quand ils ne sont pas tous vendus
    desRapide: false,			// Jeu avec le des rapide
    tourAchat: false,             // Attendre un tour avant d'acheter
    quickMove: false	// Pour des deplacements tres rapide
}

/* Preconfiguration des variantes */
const configJeu = [
    {nom: "Classique strict", config: [false, false, true, true, false]},
    {nom: "Classique", config: [false, false, false, false, false]},
    {nom: "Variante 1", config: [true, true, false, false, false]}
];

let globalStats = {	// Statistiques
    nbTours: 0,	// Nombre de tours de jeu depuis le depuis (nb de boucle de joueurs)
    heureDebut: new Date(),
    positions: []
}

let CURRENCY = "F.";

class CarteActionWrapper {
    constructor(libelle, carte, title, color, triggerLabel) {
        this.title = title;
        this.libelle = libelle;
        this.color = color;
        this.triggerLabel = triggerLabel;
        this.actionCarte = carte;
    }

    action() {
        return InfoMessage.create(GestionJoueur.getJoueurCourant(), this.title, this.color, this.libelle, () => {
            let name = `monopoly.${this.triggerLabel}.message`;
            bus.network({
                kind: 'message',
                player: GestionJoueur.getJoueurCourant().id,
                libelle: this.libelle,
                name: name
            });
            bus.send(name, {
                joueur: GestionJoueur.getJoueurCourant(),
                message: this.libelle
            });
            this.actionCarte.action(GestionJoueur.getJoueurCourant());
        }, {});
    }
}

class CarteChance extends CarteActionWrapper {
    constructor(libelle, carte, title) {
        super(libelle, carte, title, "lightblue", "chance");
    }
}

class CarteCaisseDeCommunaute extends CarteActionWrapper {
    constructor(libelle, carte, title) {
        super(libelle, carte, title, "pink", "caissecommunaute");
    }
}

// Cree le comportement lorsque le joueur arrive sur la carte
function doActions(joueur = GestionJoueur.getJoueurCourant()) {
    let fiche = GestionFiche.getById(joueur.pion.axe + "-" + joueur.pion.position);
    if (fiche == null) {
        return GestionJoueur.change();
    }
    let buttons = fiche.action(); // Recupere les actions jouables en tombant sur cette case
    // une fois l'action cree, le joueur doit faire une action
    joueur.actionApresDes(buttons, fiche);
    // Notify end play
    bus.send('move.end');
}

function restartMonopoly() {
    if (currentMonopoly == null) {
        return;
    }
    let options = currentMonopoly.options;
    currentMonopoly = new Monopoly(false);
    currentMonopoly.init();
    new PanelGameMonopoly(currentMonopoly).restartGame(options);
}

let currentMonopoly;

function startMonopoly(debug = false, showPanel = true) {
    currentMonopoly = new Monopoly(debug);
    currentMonopoly.init();
    let panel = new PanelGameMonopoly(currentMonopoly);
    if (showPanel) {
        panel.show();
    }
    return currentMonopoly;
}

class PlateauDetails {
    constructor() {
        this.infos = null;
        this.titles = {};
        this.name = null;
        this.parcGratuit = null;
        this.cartes = {caisseCommunaute: [], chance: []};
        this.drawing = null;
    }

    load(nomPlateau, options, callback, dataExtend) {
        options.nomPlateau = nomPlateau;
        return this.loadFullPath(`data/${nomPlateau}`, options, callback, dataExtend);
    }

    loadFullPath(path, options, callback, dataExtend) {
        this._temp_load_data = dataExtend;
        // On charge le plateau
        get(path).then(data => this.managePlateauConfig(data, options, callback))
            .catch(() => alert(`Le plateau ${path} n'existe pas`));
    }

    managePlateauConfig(data, options, callback) {
        if (data.plateau == null) {
            throw "Erreur avec le plateau " + options.nomPlateau;
        }
        this.name = options.nomPlateau;
        // Gestion de l'heritage
        let dataExtend = $.extend(true, {}, data, this._temp_load_data || {});
        if (data.extend != null) {
            this.load(data.extend, options, callback, dataExtend);
        } else {
            this._build(dataExtend, options, callback);
        }
    }

    loadVariantes() {
        Array.from(document.querySelectorAll('#idVariantes input[type=checkbox][name]'))
            .filter(d => VARIANTES[d.name] == null).forEach(d => VARIANTES[d.name] = d.checked);
    }

    // From monopoly plateau definition, create plateau
    _build(data, options, callback = () => {
    }) {
        this.infos = data.plateau;
        this.options = options;
        this.loadVariantes();

        DrawerFactory.setNbCases(this.infos.nbCases);
        DrawerFactory.addInfo('defaultImage', data.images.default || {});
        DrawerFactory.addInfo('textColor', this.infos.textColor || '#000000');
        DrawerFactory.addInfo('backgroundColor', this.infos.backgroundColor || '#FFFFFF');

        this.infos.argentJoueurDepart = this.infos.argent || 150000;
        this.infos.montantDepart = this.infos.depart || 20000;
        this.infos.montantPrison = this.infos.prison || 5000;

        if (this.infos.hideConstructions === true) {
            $('.action-normal').hide();
        } else {
            $('.action-normal').show();
        }
        GestionJoueur.setColors(this.infos.colors);
        GestionJoueur.setImgJoueurs(this.infos.imgJoueurs);

        if (this.infos.type === 'circle') {
            this._configureCircle();
        } else {
            this.configureSquare();
        }
        CURRENCY = data.currency;
        this.titles = data.titles || {};
        this.infos.nomsJoueurs = this.infos.nomsJoueurs || [];

        GestionDes.gestionDes = this.isQuickDice() ? new GestionDesRapideImpl(this.infos.montantPrison, this.parcGratuit) : new GestionDesImpl(this.infos.montantPrison, this.parcGratuit);
        GestionDes.init(this.infos.rollColor);
        let plateauSize = DrawerFactory.dimensions.plateauSize;
        this._createPlateauActions();
        this.drawing = DrawerFactory.getPlateau(0, 0, plateauSize, plateauSize, this.infos.backgroundColor);
        Drawer.add(this.drawing, 0);
        this._draw(data);
        Drawer.add(DrawerFactory.endPlateau(), 2);
        Drawer.init(plateauSize, plateauSize);
        GestionEnchere.setPasVente(this.infos.montantDepart / 10);
        callback();
    }

    _createPlateauActions() {
        document.querySelector("#idLancerDes").onclick = () => GestionJoueur.lancerDes();
        document.querySelector("#idOpenPanelHouses").onclick = () => GestionTerrains.open();
        document.querySelector("#idEchangeTerrains").onclick = () => EchangeDisplayer.open(GestionJoueur.getJoueurCourant());
        document.querySelector("#idOpenFreeTerrains").onclick = () => $('#idTerrainsLibres').dialog('open');
    }

    isQuickDice() {
        return this.options.typeGame === "quick";
    }

    _configureCircle() {
        DrawerFactory.setType('circle');
        $('.graphic_element,.title').addClass('circle');
        $('#idSavePanel').arctext({radius: 80, dir: 1})
        $('#idSubTitle').hide();
        $('#idInfoBox').unbind('mousewheel').bind('mousewheel', function (e, sens) {
            let scroll = $('#idInfoBox').scrollTop() + (sens * e.deltaFactor * -0.7);
            $('#idInfoBox').scrollTop(scroll);
            e.preventDefault();
        });
    }

    configureSquare() {
        DrawerFactory.setType('square');
        $('#idSavePanel').arctext({radius: -1, dir: 1})
        $('.graphic_element,.title').removeClass('circle');
    }

    _buildCartes(data, Instance, title) {
        return data != null ? data.cartes.map(c => new Instance(c.nom, CarteActionFactory.get(c, this), title)) : [];
    }

    addToGroup(groups, def, name, fiche) {
        const g = groups[def.colors[0]];
        if(g.nom == null){
            g.nom =  name;
        }
        groups[def.colors[0]].add(fiche);
        return fiche;
    }

    _createFiche(def, groups, data) {
        switch (def.type) {
            case "propriete":
                return this.addToGroup(groups, def, 'Terrain',
                    new Fiche(def.axe, def.pos, def.colors, def.nom).setCostsAndDraw(def.prix, def.loyers, def.prixMaison));
            case "propriete-junior":
                return this.addToGroup(groups, def, 'Junior', new FicheJunior(def.axe, def.pos, def.colors, def.nom).setCostsAndDraw(def.prix, [def.prix]));
            case "compagnie":
                return this.addToGroup(groups, def, 'Compagnie',
                    new FicheCompagnie(def.axe, def.pos, def.colors, def.nom).setCostsAndDraw(def.prix, def.loyers, null, data.images[def.img] || data.images.compagnie));
            case "gare":
                return this.addToGroup(groups, def, 'Gare',
                    new FicheGare(def.axe, def.pos, def.colors, def.nom).setCostsAndDraw(def.prix, def.loyers, null, data.images.gare));
            case "chance":
                return new CaseChance(def.axe, def.pos, data.images.chance, this.cartes.chance, this.titles.chance);
            case "communaute":
                return new CaseCaisseDeCommunaute(def.axe, def.pos, data.images.caisseDeCommunaute, this.cartes.caisseCommunaute, this.titles.communaute);
            case "taxe":
                return new SimpleCaseSpeciale(def.nom, def.prix, def.axe, def.pos, "taxe", data.images.taxe, this);
            case "prison":
                return new CaseActionSpeciale(def.nom, () => GestionJoueur.getJoueurCourant().goPrison(), def.axe, def.pos, "prison");
            case "special":
                return new CaseActionSpeciale(def.nom, () => GestionJoueur.change(), def.axe, def.pos, "special");
            case "parc":
                this.parcGratuit = new ParcGratuit(def.axe, def.pos);
                return this.parcGratuit;
            case "depart":
                return new CaseDepart(def.nom, def.axe, def.pos, this.infos.montantDepart);
        }
        throw "Impossible case";
    }

    _draw(data) {
        $('#idSubTitle').text(this.infos.subtitle);
        this.parcGratuit = null;
        let colors = [];
        let groups = [];
        this.cartes.chance = this._buildCartes(data.chance, CarteChance, this.titles.chance);
        this.cartes.caisseCommunaute = this._buildCartes(data.communaute, CarteCaisseDeCommunaute, this.titles.communaute);

        $(data.fiches).each((e, ficheDef) => {
            if (ficheDef.colors != null && ficheDef.colors.length > 0 && groups[ficheDef.colors[0]] == null) {
                groups[ficheDef.colors[0]] = new Groupe(ficheDef.groupe, ficheDef.colors[0]);
            }
            let fiche = this._createFiche(ficheDef, groups, data);
            if (fiche != null) {
                GestionFiche.add(fiche);
                if (fiche.color != null && colors[fiche.color] == null) {
                    // On genere un style
                    $('style', 'head').prepend(`.color_${fiche.color.substring(1)}{color:white;font-weight:bold;background-color:${fiche.color};}\n`);
                    colors[fiche.color] = 1;
                }
            }
        });
        this._calculateVoisins(data.plateau.nbCases);

    }

    /* Calcule les voisins de chaque groupe */
    _calculateVoisins(nbCases = 10) {
        let currentGroupe = null;
        let totalCases = nbCases * 4;
        // Parcourt les fiches. On enregistre le groupe courant, quand changement, on defini le groupe precedent et calcule le suivant du precedent
        for (let i = 0; i < totalCases + 2; i++) {
            let axe = Math.floor(i / nbCases) % 4;
            let pos = i % totalCases - (axe * nbCases);
            let fiche = GestionFiche.get({
                axe: axe,
                pos: pos
            });
            if (fiche != null && fiche.groupe != null && fiche.isTerrain()) {
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

    enableMouse(callback) {
        this.drawing.enableCaseDetect(callback);
    }
}

// Manage the panel to create a monopoly game
class PanelGameMonopoly {
    constructor(monopoly) {
        this.monopoly = monopoly;
        this.panelPartie = $('#idPanelCreatePartie');
    }

    show() {
        this.initSlider('sliderJoueur', 2, 4);
        this.initSlider('sliderRobot', 0, 2);
        this.loadPlateaux();
        this.loadSavedGames();
        wrapDialog(this.panelPartie, {
            title: "Monopoly",
            closeOnEscape: false,
            modal: true,
            width: 400,
            position: {my: "center top", at: "center top", of: window},
            buttons: [{
                text: "Valider",
                click: () => this.createGame()
            }]
        });
    }

    close() {
        this.panelPartie.dialog('close');
    }

    // load existing plateaux configuration
    loadPlateaux() {
        this.plateaux = $('#idSelectPlateau').empty();
        loadAllPlateaux().then(data => {
            if (data != null && data.plateaux != null) {
                data.plateaux.forEach(p => this.plateaux.append(`<option value="${p.url}">${p.name}</option>`));
            }
        });
    }

    loadSavedGames() {
        let sauvegardes = Sauvegarde.findSauvegardes();
        this.listSauvegarde = $('#idSauvegardes');
        $('option:not(:first)', this.listSauvegarde).remove();
        if (sauvegardes.length > 0) {
            sauvegardes.forEach(s => this.listSauvegarde.append(`<option value="${s.value}">${s.label}</option>`));
            $('#idDeleteSauvegarde').unbind('click').bind('click', () => {
                if ($('option:selected', this.listSauvegarde).length > 0) {
                    if (confirm(`Etes vous sur de vouloir supprimer cette sauvegarde : ${this.listSauvegarde.val()}`)) {
                        Sauvegarde.delete(this.listSauvegarde.val());
                        $('option:selected', this.listSauvegarde).remove();
                    }
                }
            });
            $('#idLoadSauvegarde').unbind('click').bind('click', () => {
                if (this.listSauvegarde.val() !== "") {
                    Sauvegarde.load(this.listSauvegarde.val(), this.monopoly);
                    this.close();
                }
            });
        }
    }

    initSlider(id, min, value) {
        $(`#${id}`).slider({
            min: min, max: 6, value: value,
            create: function () {
                this.handle = $('.ui-slider-handle', this);
                this.handle.text($(this).slider("value"));
            },
            slide: function (event, ui) {
                this.handle.text(ui.value);
            }
        });
    }

    extractOptions() {
        let options = {
            nbRobots: $('#sliderRobot').slider('value'),
            nbPlayers: $('#sliderJoueur').slider('value'),
            waitTimeIA: 1
        };
        $('#idPartie', this.panelPartie).find('select[name],:text[name]').each(function () {
            options[$(this).attr('name')] = $(this).val()
        });
        $('#idPartie', this.panelPartie).find(':checkbox[name]').each(function () {
            options[$(this).attr('name')] = $(this).is(':checked')
        });
        $('#idGameType', this.panelPartie).find(':radio:checked').each(function () {
            options[$(this).attr('name')] = $(this).val()
        });
        options.joueur = $('#idNomJoueur').val() !== "" ? $('#idNomJoueur').val() : "";
        return options;
    }

    isJoinNetwork() {
        return $('#idCreationGame').tabs('option', 'active') === 1;
    }

    isRejoinNetwork() {
        return $('#idCreationGame').tabs('option', 'active') === 2;
    }

    // Extract parameter dans create monopoly game
    createGame() {
        if (this.isJoinNetwork()) {
            this.close();
            return this.monopoly.joinNetworkGame($('#idRemoteNomJoueur').val(), $('#idRemoteGame').val());
        }
        if (this.isRejoinNetwork()) {
            this.close();
            return this.monopoly.rejoinNetworkGame();
        }
        /* Chargement d'une partie */
        VARIANTES = {};
        if (this.listSauvegarde.val() !== "") {
            Sauvegarde.load(this.listSauvegarde.val(), this.monopoly);
        } else {
            this.monopoly.options = this.extractOptions();
            this.monopoly.plateau.load($('#idSelectPlateau').val(), this.monopoly.options, () => this.monopoly._createGame(this.monopoly.options));
        }
        this.close();
    }

    restartGame(savedOptions) {
        this.monopoly.options = savedOptions;
        this.monopoly.plateau.load($('#idSelectPlateau').val(), savedOptions, () => this.monopoly._createGame(savedOptions));
    }
}

class Monopoly {
    constructor(debug) {
        DEBUG = debug;
        InfoMessage.init('message');
        FicheDisplayer.init();
        this.initPanels();
        Drawer.reset();
        GestionEnchereDisplayer.init('idEncherePanel');
        CommunicationDisplayer.init('idCommunicationEchange');
        GestionJoueur.init();
        GestionTerrains.init({
            idArgentRestant: '#idArgentRestant',
            idCout: '#idCoutTotal',
            idPanel: '#housesPanel',
            idTerrains: '#idTerrains',
            idHypotheque: '#toHypotheque',
            idTerrainsHypotheque: '#idTerrainsHypotheques',
            idTerrainsConstructibles: '#idTerrainsConstructibles',
            idCoutAchat: '#coutAchats',
            idConstructions: '#resteConstructions'
        });
        this.plateau = new PlateauDetails();

    }

    init() {
        MessageDisplayer.init('idInfoBox');
        $('.action-joueur').attr('disabled', 'disabled').addClass('disabled');
        JoueurFactory.setMouseFunction(callback=>this.plateau.enableMouse(callback));
        if (DEBUG) {
            this.plateau.load('data-monopoly.json', () => this._createGame({}));
        }
    }

    joinNetworkGame(name, game) {
        this.remoteManager = new RemoteManager(this.plateau, name, game);
    }

    rejoinNetworkGame() {
        this.remoteManager = new RemoteManager(this.plateau, "", localStorage["network_game"], localStorage["uniqueID"]);
    }

    // Create a network game as master
    _createNetworkGame(options) {
        // Create game on server then load
        createGameRequest().then(data => {
            this.remoteManager = new MasterRemoteManager(options.joueur, data.game, this.plateau);
            let players = this.remoteManager.create(options.nbPlayers, options.nbRobots, options.joueur, this.plateau.infos.nomsJoueurs, this.plateau.infos.argentJoueurDepart, this.plateau.infos.montantDepart);
            return this.afterCreateGame(players);
        });
    }

    /* Creer la partie apres le chargement du plateau */
    _createGame(options) {
        if (options.networkGame === "true") {
            return this._createNetworkGame(options);
        }
        return this._createLocalGame(options);
    }

    _createLocalGame(options) {
        let playerNames = new Array(options.nbPlayers);
        for (let i = 0; i < options.nbPlayers; i++) {
            let nom = `Joueur ${i + 1}`;
            if (i === 0 && options.joueur !== "") {
                nom = options.joueur;
            } else {
                if (this.plateau.infos.nomsJoueurs.length > i) {
                    nom = this.plateau.infos.nomsJoueurs[i];
                }
            }
            playerNames[i] = nom;
            let isRobot = i >= options.nbPlayers - options.nbRobots;
            let clazzPlayer = isRobot ? JoueurFactory.getRobotPlayer() : JoueurFactory.getCurrentPlayer();
            GestionJoueur.create(clazzPlayer, i, nom, false, this.plateau.infos.argentJoueurDepart, this.plateau.infos.montantDepart);
        }
        this.afterCreateGame(playerNames);
        GestionJoueur.change();

        /* Gestion des options */

        IA_TIMEOUT = VARIANTES.quickMove ? 10 : options.waitTimeIA || IA_TIMEOUT;
    }

    afterCreateGame(players = this.plateau.infos.nomJoueurs) {
        this.plateau.infos.realNames = players;
        $('.info-joueur').tooltip({
            show: {}, hide: {},
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
    }

    initPanels() {
        wrapDialog($('#message'), {
            autoOpen: false,
            position: {my: "center top", at: "center top", of: window},
        });
        $('#message').prev().css("background", "url()");
        /* Gestion de la sauvegarde */
        $('#idSavePanel').click(() => {
            let name = !Sauvegarde.isSauvegarde() ? prompt("Nom de la sauvegarde (si vide, defini par defaut)") : null;
            Sauvegarde.save(name, this.plateau);
        });
        // panneau d'achats de maisons
        wrapDialog($('#achatMaisons'), {
            autoOpen: false,
            position: {my: "center top", at: "center top", of: window},
            title: "Achat de maisons /hotels",
            width: 500,
            height: 300
        });
        // Liste des terrains libres
        wrapDialog($('#idTerrainsLibres'), {
            autoOpen: false,
            position: {my: "center top", at: "center top", of: window},
            title: "Liste des terrains libre",
            width: 350,
            height: 300,
            buttons: [{text: 'Fermer', click: () => $('#idTerrainsLibres').dialog('close')}],
            open: () => this._showFreeTerrains()
        });
        if(!enableNetwork){
            $('#idNetwork').hide();
        }
    }

    _showFreeTerrains() {
        $('#idTerrainsLibres').empty();
        let it = GestionFiche.getTerrainsLibres();
        while (it.hasNext()) {
            let t = it.next();
            $('#idTerrainsLibres').append(`<div style="font-weight:bold;color:${t.color}">${t.nom}</div>`);
        }
    }
}

let debug = true;
let enableNetwork = true;


function startGame() {


    $('#idCreationGame').tabs();
    $('#idMontantParc').hide();
    startMonopoly(debug)
    if ($('.mobile').is(':visible')) {
        DrawerFactory.setSize(950);
    }
}


$(() => {
    // Check if a game exist
    checkExistingGame().then(exist => {
        $('#existingGame')[exist ? "show" : "hide"]();
    });
    startGame();
});

/*  DEBUG */

/* Achete des maisons pour le joueur courant, on passe les ids de fiche */
function buy(maisons) {
    for (let i in maisons) {
        GestionJoueur.getJoueurCourant().acheteMaison(GestionFiche.getById(maisons[i]));
    }
}

export {Monopoly, CURRENCY, DEBUG, VARIANTES, IA_TIMEOUT, doActions, globalStats, startMonopoly, restartMonopoly};
