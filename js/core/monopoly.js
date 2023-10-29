import '../utils.js'
import {GestionJoueur, JoueurFactory} from './gestion_joueurs.js'
import {infoMessage, MessageDisplayer} from '../display/message.js'
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
import {CommunicationDisplayer, dialog, FicheDisplayer} from '../display/displayers.js'
import {checkExistingGame, MasterRemoteManager, RemoteManager} from '../entity/network/remote_manager.js'
import '../ui/square_graphics.js';
import '../ui/circle_graphics.js';
import {Sauvegarde} from '../sauvegarde.js';
import {createGameRequest, get, loadAllPlateaux} from "../request_service.js";
import {bus} from "../bus_message.js";
import {deepCopy} from "../utils.js";

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

const updateVariantes = values => VARIANTES = values;

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
        return infoMessage.create(GestionJoueur.getJoueurCourant(), this.title, this.color, this.libelle, () => {
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
    currentMonopoly.init(true);
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
            .catch((e) => {
                console.log(e)
                alert(`Le plateau ${path} n'existe pas`)
            });
    }

    managePlateauConfig(data, options, callback) {
        if (data.plateau == null) {
            throw "Erreur avec le plateau " + options.nomPlateau;
        }
        this.name = options.nomPlateau;
        // Gestion de l'heritage
        const dataExtend = deepCopy(data, this._temp_load_data || {});
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
        if (VARIANTES.parcGratuit) {
            document.getElementById('idMontantParc').style.setProperty('display', '');
        }

        if (this.infos.hideConstructions === true) {
            document.querySelectorAll('.action-normal').forEach(d => d.style.setProperty('display', 'none'))
        } else {
            document.querySelectorAll('.action-normal').forEach(d => d.style.setProperty('display', ''))
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
        document.getElementById("idLancerDes").onclick = () => GestionJoueur.lancerDes();
        document.getElementById("idOpenPanelHouses").onclick = () => GestionTerrains.open();
        document.getElementById("idEchangeTerrains").onclick = () => EchangeDisplayer.open(GestionJoueur.getJoueurCourant());
        document.getElementById("idOpenFreeTerrains").onclick = () => this.openTerrainsLibres();
    }

    openTerrainsLibres() {
        this._showFreeTerrains();
        dialog.open(document.getElementById('idTerrainsLibres'), {
            title: 'Liste des terrains libres',
            buttons: {"Ok": () => dialog.close()},
            height: 367,
            width: 350
        });
    }

    _showFreeTerrains() {
        const div = document.getElementById('idTerrainsLibres');
        div.innerHTML = '';
        const it = GestionFiche.getTerrainsLibres();
        while (it.hasNext()) {
            let t = it.next();
            div.insertAdjacentHTML('beforeEnd', `<div style="font-weight:bold;color:${t.color}">${t.nom}</div>`);
        }
    }

    isQuickDice() {
        return this.options.typeGame === "quick";
    }

    _configureCircle() {
        DrawerFactory.setType('circle');
        document.querySelectorAll('.graphic_element,.title').forEach(d => d.classList.add('circle'));
        new CircleType(document.getElementById('idSavePanel')).radius(185)
        document.getElementById('idSubTitle').style.setProperty('display', 'none')
        const box = document.getElementById('idInfoBox');
        box.onwheel = function (e) {
            box.scrollTop += e.deltaY;
            e.preventDefault();
        }
    }

    configureSquare() {
        DrawerFactory.setType('square');
        document.querySelectorAll('.graphic_element,.title').forEach(d => d.classList.remove('circle'));
    }

    _buildCartes(data, Instance, title) {
        return data != null ? data.cartes.map(c => new Instance(c.nom, CarteActionFactory.get(c, this), title)) : [];
    }

    addToGroup(groups, def, name, fiche) {
        const g = groups[def.colors[0]];
        if (g.nom == null) {
            g.nom = name;
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
        document.getElementById('idSubTitle').innerHTML = this.infos.subtitle;
        this.parcGratuit = null;
        let colors = [];
        let groups = [];
        this.cartes.chance = this._buildCartes(data.chance, CarteChance, this.titles.chance);
        this.cartes.caisseCommunaute = this._buildCartes(data.communaute, CarteCaisseDeCommunaute, this.titles.communaute);
        data.fiches.forEach(ficheDef => {
            if (ficheDef.colors != null && ficheDef.colors.length > 0 && groups[ficheDef.colors[0]] == null) {
                groups[ficheDef.colors[0]] = new Groupe(ficheDef.groupe, ficheDef.colors[0]);
            }
            let fiche = this._createFiche(ficheDef, groups, data);
            if (fiche != null) {
                GestionFiche.add(fiche);
                if (fiche.color != null && colors[fiche.color] == null) {
                    // On genere un style
                    document.querySelector('head style').prepend(`.color_${fiche.color.substring(1)}{color:white;font-weight:bold;background-color:${fiche.color};}\n`);
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
        document.getElementById('idJoinNetworkGame').onclick = () => this.createGame(true);
        document.getElementById('idRejoinNetworkGame').onclick = () => this.createRejoinGame();
    }

    show() {
        this.loadPlateaux();
        this.loadSavedGames();
        const p = document.querySelector('#idPanelCreatePartie');
        dialog.open(p, {
            buttons: {"Créer la partie": () => this.createGame()},
            title: 'Jouer au MONOPOLY',
            width: 600,
            height: 595
        });
    }

    close() {
        dialog.close();
    }

    // load existing plateaux configuration
    loadPlateaux() {
        this.plateaux = document.getElementById('idSelectPlateau');
        loadAllPlateaux().then(data => {
            if (data != null && data.plateaux != null) {
                data.plateaux.forEach(p => this.plateaux.insertAdjacentHTML('beforeend', `<option value="${p.url}">${p.name}</option>`));
            }
        });
    }

    loadSavedGames() {
        let sauvegardes = Sauvegarde.findSauvegardes();
        this.listSauvegarde = document.getElementById('idSauvegardes');
        this.listSauvegarde.querySelectorAll('option:not([value = ""])').forEach(d => d.remove())
        if (sauvegardes.length > 0) {
            sauvegardes.forEach(s => this.listSauvegarde.insertAdjacentHTML('beforeend', `<option value="${s.value}">${s.label}</option>`));
            document.getElementById('idDeleteSauvegarde').onclick = () => {
                if (this.listSauvegarde.value !== '') {
                    if (confirm(`Etes vous sur de vouloir supprimer cette sauvegarde : ${this.listSauvegarde.value}`)) {
                        Sauvegarde.delete(this.listSauvegarde.value);
                        this.listSauvegarde.querySelector('option:checked').remove();
                    }
                }
            }
            document.getElementById('idLoadSauvegarde').onclick = () => {
                if (this.listSauvegarde.value !== "") {
                    Sauvegarde.load(this.listSauvegarde.value, this.monopoly);
                    this.close();
                }
            }
        }
    }

    extractOptions() {
        let options = {
            nbRobots: parseInt(document.querySelector('#idNbRobots').textContent),
            nbPlayers: parseInt(document.querySelector('#idNbPlayers').textContent),
            waitTimeIA: 1
        };
        document.getElementById('idGameType').querySelectorAll('input:checked').forEach(d => options[d.name] = d.value)
        options.joueur = document.getElementById('idNomJoueur').value || "";
        return options;
    }

    createRejoinGame() {
        this.close();
        return this.monopoly.rejoinNetworkGame();
    }

    // Extract parameter dans create monopoly game
    createGame(joinNetwork = false) {
        if (joinNetwork) {
            this.close();
            return this.monopoly.joinNetworkGame(document.getElementById('idNomJoueur').value, document.getElementById('idRemoteGame2').value);
        }
        /* Chargement d'une partie */
        VARIANTES = {};
        if (this.listSauvegarde.value !== "") {
            Sauvegarde.load(this.listSauvegarde.value, this.monopoly);
        } else {
            this.monopoly.options = this.extractOptions();
            this.monopoly.plateau.load(document.getElementById('idSelectPlateau').value, this.monopoly.options, () => this.monopoly._createGame(this.monopoly.options));
        }
        this.close();
    }

    restartGame(savedOptions) {
        this.monopoly.options = savedOptions;
        this.monopoly.plateau.load(document.getElementById('idSelectPlateau').value, savedOptions, () => this.monopoly._createGame(savedOptions));
    }
}

class Monopoly {
    constructor(debug) {
        DEBUG = debug;
        infoMessage.init('message');
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

    init(reset = false) {
        MessageDisplayer.init('idInfoBox', reset);
        JoueurFactory.setMouseFunction(callback => this.plateau.enableMouse(callback));
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

    addTooltip(button) {
        const joueur = GestionJoueur.getById(button.getAttribute('data-idjoueur'));
        button.onclick = () => {
            const panel = document.getElementById('infoJoueur');
            const stats = joueur.getStats();
            panel.querySelector('.player-name').innerHTML = joueur.nom;
            panel.querySelector('.player-name').style.setProperty("color", joueur.color);

            panel.querySelectorAll('span[data-name]').forEach(s => s.innerHTML = stats[s.getAttribute("data-name")])
            dialog.open(panel, {title: joueur.name, buttons: {"Fermer": () => dialog.close()}, height: 288, width: 300})
        }
    }

    afterCreateGame(players = this.plateau.infos.nomJoueurs) {
        this.plateau.infos.realNames = players;
        document.querySelectorAll('.info-joueur').forEach(d => this.addTooltip(d));

        // Panneau d'echange
        EchangeDisplayer.init('idPanelEchange', 'idSelectJoueurs', 'idListTerrainsJoueur', 'idListTerrainsAdversaire');
    }

    initPanels() {
        /* Gestion de la sauvegarde */
        document.getElementById('idSavePanel').onclick = () => {
            let name = !Sauvegarde.isSauvegarde() ? prompt("Nom de la sauvegarde (si vide, defini par defaut)") : null;
            Sauvegarde.save(name, this.plateau);
        };
        // panneau d'achats de maisons
        if (!enableNetwork) {
            document.getElementById('idNetwork').style.setProperty('display', 'none');
        }
    }
}

let debug = true;
let enableNetwork = true;

function startGame() {
    startMonopoly(debug)
}


// Check if a game exist
checkExistingGame().then(exist => {
    document.getElementById('idRejoinNetworkGame').style.setProperty('display', exist ? "" : "none");
});
initDebug();
startGame();

/*  DEBUG */

/* Achete des maisons pour le joueur courant, on passe les ids de fiche */
function buy(maisons) {
    for (let i in maisons) {
        GestionJoueur.getJoueurCourant().acheteMaison(GestionFiche.getById(maisons[i]));
    }
}

function initDebug(){
    if(debug) {
        document.getElementById('idDebugNbDices').onclick = () => GestionJoueur.getJoueurCourant().joueDes(document.getElementById('nb').value);
        document.getElementById('idDebugDices').onclick = () => GestionJoueur.getJoueurCourant().pion.goto(document.getElementById('ide').value,document.getElementById('idp').value,doActions);
        document.getElementById('idDebug').style.setProperty('display','');
    }
}

export {Monopoly, CURRENCY, DEBUG, VARIANTES, updateVariantes, IA_TIMEOUT, doActions, globalStats, startMonopoly, restartMonopoly};
