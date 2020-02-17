/* Gere les affichages (message dialog, trace de log) */

/* Intercepte les evenements et affiche une information */
let MessageDisplayer = {
    div: null,
    order: 0,
    init: function (id) {
        if(this.div == null){
            // Not init already, create div and bind events
            this.div = $('#' + id);
            this.bindEvents();
        }
        this.div.empty();
    },
    write: function (joueur, message) {
        MessageDisplayer.order++;
        var orderMessage = (DEBUG) ? (' (' + MessageDisplayer.order + ')') : '';
        this.div.prepend('<div><span style="color:' + joueur.color + '">' + joueur.nom + '</span> : ' + message + orderMessage + '</div>');
    },
    _buildProposition: function (proposition) {
        if (proposition == null) {
            return "";
        }
        var message = "";
        if (proposition.terrains.length > 0) {
            for (var i = 0; i < proposition.terrains.length; i++) {
                message += this.events._buildTerrain(proposition.terrains[i]) + ", ";
            }
        }
        if (proposition.compensation > 0) {
            message += " compensation : " + proposition.compensation + " " + CURRENCY;
        }
        return message;
    },
    events:{
        write(player,message){
            MessageDisplayer.write(player,message);
        },
        _buildTerrain: function (terrain) {
            return  terrain == null ? '' : `<span style="font-weight:bold;color:${terrain.color}">${terrain.nom}</span>`;
        },
        people(nom,color='black'){
            return {color:color,nom:nom};
        },
        save(event){
            this.write(this.people('info','green'), `sauvegarde de la partie (${event.name})`);
        },
        depart(event){
            this.write(event.joueur, `s\'arrête sur la case départ et gagne ${event.montant} ${CURRENCY}`);
        },
        initEnchere(event){
            this.write(event.joueur != null ? event.joueur : this.people('La banque'), `met aux enchères  ${this._buildTerrain(event.maison)}`);
        },
        failEnchere(event){
            this.write(this.people('Commissaire priseur','red'),`le terrain ${this._buildTerrain(event.maison)} n\'a pas trouvé preneur`);
        },
        successEnchere(event){
            this.write(event.joueur, `achète aux enchères le terrain ${this._buildTerrain(event.maison)} pour ${CURRENCY} ${event.montant}`);
        },
        message(event){

        },
        caisseCommunaute(event){
            this.write(event.joueur, `carte caisse de communauté : ${event.message}`);
        },
        chance(event){
            this.write(event.joueur, `carte chance : ${event.message}`);
        },
        achete(event){
            this.write(event.joueur, `achète ${this._buildTerrain(event.maison)}`);
        },
        home(event){
            this.write(event.joueur, `tombe sur ${this._buildTerrain(event.maison)} . Il est chez lui.`);
        },
        visite(event){
            this.write(event.joueur, `tombe sur ${this._buildTerrain(event.maison)}`);
        },
        vend(event){
            this.write(event.joueur, `vends ${event.nbMaison} maison(s)</span>`);
        },
        loyer(event){
            let mais = event.maison;
            let m = `<span style="font-weight:bold;color:${mais.color}"> ${mais.nom}</span>`;
            let jp = `<span style="color:${mais.joueurPossede.color}">${mais.joueurPossede.nom}</span>`;
            this.write(event.joueur, `tombe sur ${m} et paye ${mais.getLoyer()} ${CURRENCY} à ${jp}`);
        },
        player(event){
            this.write(event.joueur, "rentre dans la partie");
        },
        hypotheque(event){
            this.write(event.joueur, `hypothèque ${this._buildTerrain(event.maison)}`);
        },
        leveHypotheque(event){
            this.write(event.joueur, `lève l'hypothèque de ${this._buildTerrain(event.maison)}`);
        },
        prison(event){
            this.write(event.joueur, "va en prison");
        },
        lanceDes(event){
            let message = `lance les dés et fait ${event.total} (${event.combinaison})`;
            if(event.prison !=null){
                if(event.prison.sortie === true){
                    message += " et sort de prison";
                    if(event.prison.montant > 0 ){
                        message+=` en payant ${CURRENCY} ${event.prison.montant}`;
                    }
                }else{
                    message += " et reste en prison";
                }
            }
            if(event.double != null){
                if(event.double.triple === true){
                    message += ", a fait 3 doubles et va en prison";
                }
                if(event.double.replay === true){
                    message += " et rejoue";
                }
            }
            this.write(event.joueur, message);
        },
        desBus(event){
            this.write(event.joueur, ` prend le bus et fait ${event.total}`);
        },
        desMrMonopoly(event){
            this.write(event.joueur, ` fait un Mr Monopoly et va sur ${this._buildTerrain(event.maison)}`);
        },
        desTriple(event){
            this.write(event.joueur, ` fait un triple et choisi d'aller à ${this._buildTerrain(event.maison)}`);
        },
        sortiePrison(event){
            let message = "sort de prison";
            if(event.paye === true){
                message += " en payant";
            }
            if(event.carte === true){
                message += " en utilisant une carte sortie de prison"
            }
            this.write(event.joueur, message);
        },
        construit(event){
            var message = "";
            let achats = event.achats;
            if (achats.maison > 0) {
                message += `achète ${achats.maison} maison(s) `;
            } else {
                if (achats.maison < 0) {
                    message += `vend ${(achats.maison * -1)} + " maison(s) `;
                }
            }
            if (achats.hotel > 0) {
                message += ((message !== "") ? " et " : "") + `achète ${achats.hotel}  hôtel(s) `;
            } else {
                if (achats.hotel < 0) {
                    message += ((message !== "") ? " et " : "") + `vend ${(achats.hotel * -1)} hôtel(s) `;
                }
            }
            // On affiche la liste des terrains
            if(achats.terrains!=null && achats.terrains.size() > 0){
                message+=" sur ";
                for(let id in achats.terrains){
                    message+=this._buildTerrain(achats.terrains[id]) + ", ";
                }
            }
            if (message !== "") {
                this.write(event.joueur, message);
            }
        },
        initEchange(event){
            let message = `souhaite obtenir ${this._buildTerrain(event.maison)} auprès de ${event.maison.joueurPossede.nom}`;
            this.write(event.joueur, message);
        },
        proposeEchange(event){
            this.write(event.joueur, `propose : ${MessageDisplayer._buildProposition(event.proposition)}`);
        },
        accepteEchange(event){
            this.write(event.joueur, 'accepte la proposition');
        },
        rejetteEchange(event){
            this.write(event.joueur, 'rejete la proposition');
        },
        contreEchange(event){
            this.write(event.joueur, `fait une contre-proposition ${MessageDisplayer._buildProposition(event.proposition)}`);
        },
        defaite(event){
            this.write(event.joueur, 'a perdu et quitte la partie');
        },
        victoire(event){
            this.write(event.joueur, 'a gagné la partie');
        },
        waitPlayers(event){
            this.write(this.people('Monopoly'),`Partie n°${event.idGame} créée, en attente de ${event.nb} joueur(s)...`);
        },
        debug(event){
            if (DEBUG) {
                this.write(this.people('debug','red'), event.message);
            }
        }
    },
    bindEvents: function () {
        $
            .bind("monopoly.save", (e, data) =>this.events.save(data))
            .bind("monopoly.depart", (e, data) =>this.events.depart(data))
            .bind("monopoly.enchere.init",  (e, data) =>this.events.initEnchere(data))
            .bind("monopoly.enchere.fail", (e, data) => this.events.failEnchere(data))
            .bind("monopoly.enchere.success",  (e, data) => this.events.successEnchere(data))
            .bind("monopoly.caissecommunaute.message", (e, data) =>this.events.caisseCommunaute(data))
            .bind("monopoly.chance.message", (e, data) =>this.events.chance(data))
            .bind("monopoly.acheteMaison", (e, data) =>this.events.achete(data))
            .bind("monopoly.chezsoi", (e, data) =>this.events.home(data))
            .bind("monopoly.visiteMaison", (e, data) =>this.events.visite(data))
            .bind("monopoly.vendMaison", (e, data) =>this.events.vend(data))
            .bind("monopoly.payerLoyer", (e, data) =>this.events.loyer(data))
            .bind("monopoly.newPlayer", (e, data) =>this.events.player(data))
            .bind("monopoly.hypothequeMaison", (e, data) => this.events.hypotheque(data))
            .bind("monopoly.leveHypothequeMaison", (e, data) =>this.events.leveHypotheque(data))
            .bind("monopoly.goPrison", (e, data) =>this.events.prison(data))
            .bind("monopoly.derapide.bus", (e, data) =>this.events.desBus(data))
            .bind("monopoly.derapide.triple", (e, data) => this.events.desTriple(data))
            .bind("monopoly.derapide.mrmonopoly", (e, data) =>this.events.desMrMonopoly(data))
            .bind("monopoly.exitPrison", (e, data) =>this.events.sortiePrison(data))
            .bind("monopoly.acheteConstructions", (e, data) =>this.events.construit(data))
            .bind("monopoly.echange.init",  (e, data) => this.events.initEchange(data))
            .bind("monopoly.echange.propose",  (e, data) =>this.events.proposeEchange(data))
            .bind("monopoly.echange.accept",  (e, data) => this.events.accepteEchange(data))
            .bind("monopoly.echange.reject",  (e, data) => this.events.rejetteEchange(data))
            .bind("monopoly.echange.contrepropose",  (e, data) => this.events.contreEchange(data))
            .bind("monopoly.defaite",  (e, data) => this.events.defaite(data))
            .bind("monopoly.victoire",  (e, data) => this.events.victoire(data))
            .bind("monopoly.waitingPlayers",  (e, data) => this.events.waitPlayers(data))
            .bind("monopoly.debug",  (e, data) => this.events.debug(data));
    }
}

/* Affichage des informations dans une boite de dialogue */
var InfoMessage = {
    div:null,
    init:function(id){
        this.div = $('#' + id);
    },
    _initMessage:function(color,titre,message){
        $.trigger('monopoly.debug', {
            message: message
        });
        this.div.prev().css("background-color", color);
        this.div.dialog('option', 'title', titre);
        this.div.empty();
        this.div.append(message);
    },
    /* Affiche uniquement pour un vrai joueur */
    createGeneric:function(joueur,titre, background, message, actionButtons){
        this._initMessage(background,titre,message);

        // Empeche la fermeture sans vraie action
        this.div.unbind('dialogclose.message').bind('dialogclose.message', function () {
            InfoMessage.div.dialog('open');
        });
        var buttons = {};
        actionButtons.forEach(function(action){
            buttons[action.title] = function(){
                InfoMessage.div.unbind('dialogclose.message');
                InfoMessage.div.dialog('close');
                action.fct();
            }
        });
        this.div.dialog('option', 'buttons', buttons);

        if (joueur.canPlay || forceshow) {
            wrapDialog(this.div,'open');
        }
        return buttons;
    },
    /* @params buttons : additonal buttons */
    create:function(joueur,titre, background, message, call, param, forceshow,buttons){
        this._initMessage(background,titre,message);
        var button = {
            "Ok": function () {
                InfoMessage.close();
            }
        };
        if(buttons != null){
            for(var title in buttons){
                button[title] = buttons[title];
            }
        }
        this.div.unbind('dialogclose.message').bind('dialogclose.message', function () {
            InfoMessage.div.unbind('dialogclose.message');
            if (call != null) {
                call(param);
            }

        });
        if (call != null) {
            this.div.dialog('option', 'buttons', button);
        }
        /* On affiche pas le panneau si le timeout est à 0 (partie rapide) */
        if (joueur.canPlay || forceshow) {
            wrapDialog(this.div,'open');
        }
        return button;
    },
    close:function(){
        if (this.div.dialog('isOpen')) {
            this.div.dialog('close');
        } else {
            // Trigger de fermeture
            this.div.trigger('dialogclose.message');
            this.div.trigger('dialogclose.prison');
        }
    },
    createPrison:function(joueur,nbTours, callback){
        this._initMessage("red","Vous êtes en prison depuis " + nbTours + " tours.","Vous êtes en prison, que voulez vous faire");

        var buttons = {
            "Payer": function () {
                joueur.payer(InitMonopoly.plateau.infos.montantPrison);
                // TODO : Ajouter message pour indiquer qu'il paye
                joueur.exitPrison({paye:true});
                InfoMessage.close();
            },
            "Attendre": function () {
                InfoMessage.close();
            }
        }
        if (joueur.cartesSortiePrison.length > 0) {
            buttons["Utiliser carte"] = function () {
                joueur.utiliseCarteSortiePrison();
                // TODO : ajouter message pour dire qu'il utilise une carte
                joueur.exitPrison({carte:true});
                InfoMessage.close();
            }
        }
        this.div.dialog('option', 'buttons', buttons);
        this.div.bind('dialogclose.prison', function () {
            InfoMessage.div.unbind('dialogclose.prison');
            callback();
        });
        if (joueur.canPlay) {
            wrapDialog(this.div,'open');
        }
        return buttons;
    }
}
