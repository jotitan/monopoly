/* Manage events during remote game */
import {GestionJoueur, JoueurFactory} from '../../gestion_joueurs.js'
import {InfoMessage, MessageDisplayer} from "../../display/message.js";
import {DiceThrower, GestionDes} from "../dices.js";
import {GestionFiche} from "../../display/case_jeu.js";
import {startMonopoly, DEBUG, VARIANTES} from "../../monopoly.js";
import {GestionTerrains} from "../../gestion_terrains.js";
import {Sauvegarde} from "../../sauvegarde";

// Check if a game is in memory and still working
export async function checkExistingGame(){
    if(localStorage != null && localStorage["network_game"] != null && localStorage["uniqueID"] != null){
        let exist = await fetch(`/game/exist?id=${localStorage["network_game"]}`)
            .then(data=>new Response(data.body).text())
        return exist === "true";
    }
    return false;
}

/* RemoteManager manage the connexion to the remote game master */
class RemoteManager {
    /* @param playerUniqueId : id of player when try to reconnect */
    constructor(name,game,playerUniqueId,connect=true){
        if(connect) {
            this.name = name;
            this.game = game;
            this.playerUniqueID = playerUniqueId;
            this.startSource();
            this.listenLocalEvents();
        }
    }
    startSource(){
        this.source = new EventSource(`/connect?name=${name}&game=${this.game}${this.playerUniqueID?`&player=${this.playerUniqueID}`:''}`);

        this.source.onerror = (e) => {
            InfoMessage.create({},"Connection impossible","red","Impossible de se connecter, le numéro de partie n'existe pas",()=>startMonopoly(),{},true)
        };
        this.queueEvents.detectEndMove();
        this.source.addEventListener('event', (e) => {
            this.queueEvents.add(JSON.parse(e.data));
        });

        this.source.addEventListener('welcome', (e) => {
            // Save game in local storage to reconnect later
            if(localStorage!=null){
                localStorage["network_game"] = this.game;
            }
            this.welcome(JSON.parse(e.data));
        });
    }
    isMaster(){return false;}
    welcome(data){
        if(this.playerID === undefined){
            // Initialize player
            this.playerID = data.playerID;
            const url = `/event?game=${this.game}&playerID=${this.playerID}`;
            this.eventSender = new EventSender(url,null,this.isMaster());
            this.askJoin();

        }
    }
    askJoin(){
        let data = {kind:"join",playerID:this.playerID,name:this.name};
        if(this.playerUniqueID != null){
            data.uniqueID = this.playerUniqueID;
        }
        this.eventSender.sendEvent(data);
    }
    // Listen events send by players and send to server
    listenLocalEvents(){
        $.bind("event.network",(e,data)=>{
            this.debug("Receive local EVENT",data);
            this.eventSender.sendEvent(data);
        });
    }
    // Create the game
    // @param position : position of player in game
    create(nbJoueurs,position,name,data,argentDepart, montantDepart){
        let options = {typeGame:data.quickDice ? "quick":"classic"};
        // Create a monopoly instance here @TODO
        return new Promise(r=> {
            let monopoly = startMonopoly(false, false);
            monopoly.plateau.load(data.plateau, options, () => {
                JoueurFactory.useNetwork();
                JoueurFactory.setSlave();
                for (let i = 0; i < nbJoueurs; i++) {
                    let player = i === position ? JoueurFactory.getCurrentPlayer() : JoueurFactory.getOtherPlayer();
                    // @TODO get defaite from data
                    GestionJoueur.create(player, i, i === position ? name : data.playersName[i], false, argentDepart, montantDepart);
                }
                this.queueEvents.end(data);
                monopoly.afterCreateGame(data.playersName)
                r();
            });
        });

    }
    debug(){
        if(DEBUG){
            console.log(...arguments);
        }
    }
    readEvent(event){
        //console.log("Manage event",event.kind,event,GestionJoueur.getJoueurCourant())
        // Dispatch to good player
        let joueur = GestionJoueur.getById(event.player);
        if(event.kind !== "disconnected" && event.kind !== "join"
            && event.kind !== "connected" && event.kind !== "end"
            && joueur == null){
            throw `No player found for event ${event.kind}`;
        }
        switch(event.kind){
            // Receive number of dices of player, just display message
            case "disconnected":this.debug("DISCONNECTED",event);this.disconnect(event);break; //
            case "connected":this.debug("CONNECTED",event);this.connect(event,joueur);return; //
            case "move":this.debug("MOVES",event);joueur.moveTo(event.nb);break;   //
            case "moveTo":this.debug("MOVES",event);joueur.joueSurCase(GestionFiche.getById(event.to));break;   //
            case "tax":this.debug("TAX",event);joueur.setArgent(joueur.montant - event.montant);break;    //
            case "earn":this.debug("EARN",event);joueur.setArgent(joueur.montant + event.montant);break;   //
            case "hypotheque":this.debug("HYPOTHEQUE",event);GestionFiche.getById(event.terrain).doHypotheque();break; //
            case "leverHypotheque":this.debug("LEVER HYPOTHEQUE",event);GestionFiche.getById(event.terrain).doLeveHypotheque();break;  //
            case "change":this.debug("CHANGE");GestionJoueur._select(joueur);break;   //
            case "jail":this.debug("JAIL");joueur.goPrison();break;
            case "buyHouse":this.debug("BUY HOUSE");GestionFiche.getById(event.terrain).setNbMaison(event.nb);break;
            case "loyer":this.debug("LOYER");$.trigger('monopoly.payerLoyer',{joueur:joueur,maison:GestionFiche.getById(event.maison)});break;
            case "exit":this.debug("EXIT");$.trigger('monopoly.exit',{joueur:joueur});break;
            case "message":this.debug("GOT MESSAGE");
                $.trigger(event.name, {
                    joueur: joueur,
                    message: event.libelle
                });
                break;
            case "buy":this.debug("BUY",event);    //
                joueur.acheteMaison(GestionFiche.getById(event.terrain),0); // Zero cost because tax event is also sent
                break;
            default:this.readMoreEvent(event,joueur);break;
        }

        this.queueEvents.end(event);
    }
    connect(event,joueur){
        VARIANTES.quickMove = event.quickMove;
        if(event.playerID === this.playerID){
            this.create(event.nb,event.posPlayer,event.name,event,event.argentDepart,event.montantDepart)
                .then(()=>this._updatePlayers(event));
            localStorage["uniqueID"] = event.uniqueID;
        }else{
            if(joueur != null){
                joueur.setPlayer(event.name);
            }
        }
    }
    _updatePlayers(event){
        if(event.joueurCourant !== ''){
            GestionJoueur.change(event.joueurCourant);
        }
        event.detailJoueurs.forEach(player=>{
            let p = GestionJoueur.getById(player.id);
            p.setArgent(player.montant);
            p.joueSurCaseNoAction(player.position);
            if(player.enPrison){
                p.showPrison();
            }
            p.nbDouble = player.nbDouble;
            player.maisons.forEach(m=>p.showAcheteMaison(GestionFiche.get(m)))
        })
    }
    // Disconnect if player can join
    disconnect(event){
        if(event.playerID === this.playerID){
            this.source.close();
            InfoMessage.create({canPlay:true},"Impossible to connect game","red","You can't access monopoly game, no enough place",()=>startMonopoly())
        }
    }
    // Call if event is not already found and manage. Could be override
    readMoreEvent(event,joueur){
        switch(event.kind){
            case "dices"://this.debug("DICES",event,joueur);
                GestionDes.gestionDes.setAndShowDices(event,joueur);
                break;
            case "prison"://this.debug("PRISON",joueur);
                joueur.goPrison(false);
                break;
            case "exitPrison"://this.debug("PRISON",joueur,event);
                joueur.exitPrison({noTrigger:false,paye:event.paye,carte:event.carte,notify:false});
                break;
        }
    }
    queueEvents={
        parent:this,
        queue:[],
        add(event){
            if(this.queue.push(event) === 1){
                this.launch();
            }
        },
        launch(){
            if(this.queue.length === 0){return;}
            let event = this.queue[0];
            this.parent.readEvent(event);
        },
        end(event,force){
            if(this.queue.length !== 0 && event.kind === this.queue[0].kind && (event.kind !== "moveTo" || force === true)) {
                //console.log("End of",event.kind);
                // Remove event and relaunch
                this.queue.shift();
                this.launch();
            }
        },
        // Detect end play game
        detectEndMove(){
            $.bind('move.end',()=>this.end({kind:'moveTo'},true));
        }
    }
}

/* MasterRemoteManager manage the local game master with network connexion */
export class MasterRemoteManager extends RemoteManager{
    constructor(name,game,plateau){
        super(name,game);
        // Plateau monopoly
        this.plateau = plateau;
    }
    create(nbJoueurs, nbRobots,playerName,players,argentDepart,montantDepart){
        JoueurFactory.useNetwork();
        JoueurFactory.setMaster();
        let nbRemote = nbJoueurs - nbRobots - 1;
        for (let i = 0; i < nbJoueurs; i++) {
            let player;
            let pName = `Joueur ${i+1}`;
            if (i === 0) {
                player = JoueurFactory.getCurrentPlayer();
                if(playerName !==""){
                    pName = playerName;
                }
            } else {
                if(i < players.length && players[i] !== undefined){
                    pName = players[i];
                }
                if (i < nbRemote + 1) {
                    player = JoueurFactory.getOtherPlayer();
                }
                if (i > nbRemote) {
                    player = JoueurFactory.getRobotPlayer();
                }
            }
            players[i] = pName;
            GestionJoueur.create(player, i, pName,false,argentDepart,montantDepart);
        }
        if(nbRemote > 0) {
            $.trigger("monopoly.waitingPlayers", {nb: nbRemote,idGame:this.game});
        }
        return players;
    }
    readMoreEvent(event,joueur){
        // Must check player is current ?
        switch(event.kind){
            case "launchDices"://console.log("Throw Dices");
                DiceThrower.throw(3).then(dices=>{
                    GestionDes.gestionDes.setDices(dices[0],dices[1],dices[2]);
                    GestionDes.gestionDes._drawCubes(dices[0],dices[1],dices[2]);
                    GestionDes.gestionDes.after();
                });
                break;
            case "join"://console.log("JOIN");
                this.joinGame(event);
                break;
            case "end"://console.log("END TURN");
                GestionJoueur.change();
                break;
            default:super.readMoreEvent(event,joueur);break;
        }
    }
    askJoin(){}
    rejoinGame(event){
        // Search player with uniqueID
        let player = GestionJoueur.getByUniqueId(event.uniqueID);
        if(player == null){
            console.log("Error non player")
        }
        player.playerID = event.playerID;
        MessageDisplayer.write(player, "is rejoining the game");
        console.log("DATA",this.createGameInformations(player,event))
        this.eventSender.sendEvent(this.createGameInformations(player,event));
    }
    joinGame(event){
        if(event.uniqueID != null){
            return this.rejoinGame(event);
        }
        let availables = GestionJoueur.getAvailableSlots();
        if(availables.length === 0){
            // Send error
            console.log("No more free spaces")
            return this.eventSender.sendEvent({kind:"disconnected",playerID:event.playerID})
        }
        let player = availables[0];
        // Fix the first
        player.setPlayer(event.name);
        player.playerID = event.playerID;
        player.uniqueID = `id_${btoa(Math.random()*100000000)}`
        MessageDisplayer.write(player, "is joining the game");
        console.log("DATA",this.createGameInformations(player,event))
        this.eventSender.sendEvent(this.createGameInformations(player,event));
        // If last available, start game
        if(availables.length === 1){
            GestionJoueur.change();
            $.trigger('monopoly.start');
        }
    }
    createGameInformations(player,event){
        return {
            kind:'connected',
            // Player info
            player:player.id,
            name:player.nom,
            posPlayer:player.numero,
            playerID:event.playerID,
            uniqueID:player.uniqueID,

            // Game initial info
            playersName:this.plateau.infos.realNames,
            plateau:this.plateau.name,
            quickMove:VARIANTES.quickMove,
            argentDepart:this.plateau.infos.argentJoueurDepart,
            montantDepart:this.plateau.infos.montantDepart,
            quickDice:this.plateau.isQuickDice(),
            nb:GestionJoueur.getNbJoueurs(),

            // Current game info
            joueurCourant:GestionJoueur.getJoueurCourant() != null ? GestionJoueur.getJoueurCourant().id:'',

            // Game current info on player. For each player : argent, prison, proprietes
            detailJoueurs:this.getPlayersInformations()

        };
    }
    getPlayersInformations() {
     return GestionJoueur.joueurs.map(j=>{
         return {
             id:j.id,
             montant:j.montant,
             enPrison:j.enPrison,
             nbDouble:j.nbDouble,
             defaite:j.defaite,
             position:j.getPosition(),
             maisons:j.maisons.maisons.map(m=>{return {
                 hotel:m.hotel,
                 axe:m.axe,
                 pos:m.pos,
                 nbMaison:m.nbMaison,
                 statutHypotheque:m.statutHypotheque
             }})
         }
     });
    }
    isMaster(){return true;}
    sendDices(dices,player){
        this.eventSender.sendEvent({"kind":"dices",player:player,"dice1":dices[0],"dice2":dices[1],"quickDice":dices[2]});
    }
}

// Distribute event to server
class EventSender{
    constructor(url,plateau,isMaster=false){
        this.url = url;
        this.isMaster = isMaster;
        this.plateau = plateau;
    }
    sendEvent(event){
        $.ajax({
            method:"POST",
            data:JSON.stringify(event),
            dataType:'json',
            url:this.url
        });
        if(this.isMaster){
            Sauvegarde.saveWithName("lastest",this.plateau)
        }
    }
}

export {RemoteManager};
