/* Manage events during remote game */

class RemoteManager {
    constructor(name,game,connect=true){
        if(connect) {
            this.name = name;
            this.game = game;
            this.startSource();
            this.listenLocalEvents();
        }
    }
    startSource(){
        this.source = new EventSource(`/connect?name=${name}&game=${this.game}`);

        this.source.onerror = (e) => {
            console.log('ERROR', e);
        };
        this.queueEvents.detectEndMove();
        this.source.addEventListener('event', (e) => {
            //this.readEvent(JSON.parse(e.data));
            this.queueEvents.add(JSON.parse(e.data));
        });

        this.source.addEventListener('welcome', (e) => {
            this.welcome(JSON.parse(e.data));
        });
    }
    welcome(data){
        if(this.playerID === undefined){
            // Initialize player
            this.playerID = data.playerID;
            this.eventSender = new EventSender(`/event?game=${this.game}&playerID=${this.playerID}`);
            this.askJoin();

        }
    }
    askJoin(){
        this.eventSender.sendEvent({kind:"join",playerID:this.playerID,name:this.name});
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
        let monopoly = startMonopoly();
        monopoly.plateau.load(data.plateau,options,()=> {
            JoueurFactory.useNetwork();
            JoueurFactory.setSlave();
            for (let i = 0; i < nbJoueurs; i++) {
                let player = i === position ? JoueurFactory.getCurrentPlayer() : JoueurFactory.getOtherPlayer();
                GestionJoueur.create(player, i, i === position ? name : data.playersName[i],argentDepart,montantDepart);
            }
            this.queueEvents.end(data);
            monopoly.afterCreateGame(data.playersName)
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
        if(event.kind !== "join" && event.kind !== "connected" && event.kind !== "end" && joueur == null){
            throw "No player found";
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
        if(event.playerID === this.playerID){
            this.create(event.nb,event.posPlayer,event.name,event,event.argentDepart,event.montantDepart);
        }else{
            if(joueur != null){
                joueur.setPlayer(event.name);
            }
        }
    }
    // Disconnect if player can join
    disconnect(event){
        if(event.playerID === this.playerID){
            console.log("disconnect");
        }
    }
    // Call if event is not already found and manage. Could be override
    readMoreEvent(event,joueur){
        switch(event.kind){
            case "dices":this.debug("DICES",event,joueur);
                GestionDes.gestionDes.setAndShowDices(event,joueur);
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
            $.bind('move.end',()=>{console.log("Receive END MOVE");this.end({kind:'moveTo'},true)});
        }
    }
}

// Manage more events cause manage game
class MasterRemoteManager extends RemoteManager{
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
            var player;
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
            case "launchDices":console.log("Throw Dices");
                DiceThrower.throw(3).then(dices=>{
                    GestionDes.gestionDes.setDices(dices[0],dices[1],dices[2]);
                    GestionDes.gestionDes._drawCubes(dices[0],dices[1],dices[2]);
                    GestionDes.gestionDes.after();
                });
                break;
            case "join":console.log("JOIN");
                this.joinGame(event);
                break;
            case "end":console.log("END TURN");
                GestionJoueur.change();
                break;
            default:super.readMoreEvent(event,joueur);break;
        }
    }
    askJoin(){}
    joinGame(event){
        let availables = GestionJoueur.getAvailableSlots();
        if(availables.length === 0){
            // Send error
            console.log("No more free spaces")
            this.eventSender.sendEvent({kind:"disconnected",playerID:event.playerID})
            return;
        }
        let player = availables[0];
        // Fix the first
        player.setPlayer(event.name);
        MessageDisplayer.write(player, "is joining the game");
        this.eventSender.sendEvent({
            player:player.id,
            playersName:this.plateau.infos.realNames,
            plateau:this.plateau.name,
            posPlayer:player.numero,
            playerID:event.playerID,
            name:player.nom,
            kind:'connected',
            argentDepart:this.plateau.infos.argentJoueurDepart,
            montantDepart:this.plateau.infos.montantDepart,
            quickDice:this.plateau.isQuickDice(),
            nb:GestionJoueur.getNbJoueurs()});
        // If last available, start game
        if(availables.length === 1){
            GestionJoueur.change();
        }
    }
    sendDices(dices,player){
        this.eventSender.sendEvent({"kind":"dices",player:player,"dice1":dices[0],"dice2":dices[1],"quickDice":dices[2]});
    }
}

// Distribute event to server
class EventSender{
    constructor(url){
        this.url = url;
    }
    sendEvent(event){
        $.ajax({
            method:"POST",
            data:JSON.stringify(event),
            dataType:'json',
            url:this.url
        });
    }
}