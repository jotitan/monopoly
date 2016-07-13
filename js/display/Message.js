/* Gere les affichages (message dialog, trace de log) */

/* Intercepte les evenements et affiche une information */
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
        if(terrain == null){return "";}
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
            MessageDisplayer.write(data.joueur, 's\'arrête sur la case départ et gagne ' + data.montant + " " + CURRENCY);
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
        }).bind("monopoly.derapide.bus", function (e, data) {
            MessageDisplayer.write(data.joueur, " prend le bus et fait " + data.total);
        }).bind("monopoly.derapide.triple", function (e, data) {
            MessageDisplayer.write(data.joueur, " fait un triple et choisi d'aller à " + MessageDisplayer._buildTerrain(data.maison));
        }).bind("monopoly.derapide.mrmonopoly", function (e, data) {
            MessageDisplayer.write(data.joueur, " fait un Mr Monopoly et va sur " + MessageDisplayer._buildTerrain(data.maison));
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
            this.div.dialog('open');
        }
        return buttons;
	},	
	create:function(joueur,titre, background, message, call, param, forceshow){
		this._initMessage(background,titre,message);
        var button = {
            "Ok": function () {
                InfoMessage.close();
            }
        };
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
            this.div.dialog('open');
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
                joueur.exitPrison();
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
                joueur.exitPrison();
                InfoMessage.close();
            }
        }
        this.div.dialog('option', 'buttons', buttons);
        this.div.bind('dialogclose.prison', function () {
            InfoMessage.div.unbind('dialogclose.prison');
            callback();
        });
        if (joueur.canPlay) {
            this.div.dialog('open');
        }
        return buttons;
	}
}
