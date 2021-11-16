package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jotitan/monopoly/dice"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var resources string
func main(){
	if len(os.Args) != 2 {
		log.Fatal("Impossible to start server, need 1 argument : resources folder",os.Args)
		return
	}
	resources = os.Args[1]
	runServer()
}

func runServer(){
	server := http.NewServeMux()
	server.HandleFunc("/dices",runDice)
	server.HandleFunc("/createGame",createGame)
	server.HandleFunc("/game/exist",isGameExists)
	server.HandleFunc("/event",manageEvent)
	server.HandleFunc("/connect",connectGame)
	server.HandleFunc("/",root)

	log.Println("Run on 8100")
	http.ListenAndServe(":8100",server)
}

// Launch some dices and return results
func runDice(w http.ResponseWriter, r * http.Request){
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-type","application/json")

	if nb,err := strconv.ParseInt(r.FormValue("nb"),10,32) ; err == nil {
		data,_ := json.Marshal(dice.Throw(int(nb)))
		w.Write(data)
	}
}

// Serve files
func root(response http.ResponseWriter,request *http.Request){
	if strings.HasSuffix(request.RequestURI[1:],".js") {
		response.Header().Set("Content-Type","text/javascript")
	}
	http.ServeFile(response,request,filepath.Join(resources,request.RequestURI[1:]))
}

func generateGameId()string{
	d := []byte(time.Now().Format("20060102150405"))
	r := rand.Uint64()
	data := make([]byte,8)
	binary.LittleEndian.PutUint64(data,r)
	d = append(d,data...)
	return hex.EncodeToString(data)
}

func isGameExists(w http.ResponseWriter, r * http.Request) {
	gameID := r.FormValue("id")
	_,exist := games[gameID]
	w.Write([]byte(fmt.Sprintf("%t",exist)))
}

func createGame(w http.ResponseWriter, r * http.Request){
	gameID := generateGameId()
	games[gameID] = &Game{ID:gameID,Players:make(map[string]chan []byte),counterID:0}
	w.Header().Set("Content-type","application/json")
	w.Write([]byte(fmt.Sprintf("{\"game\":\"%s\"}",gameID)))
}

// Receive an event from a player, send to others, avoid launcher
// Two parameters is needed : game id and player sender id
func manageEvent(w http.ResponseWriter, r * http.Request){
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if data,err := ioutil.ReadAll(r.Body) ; err == nil {
		gameID := r.FormValue("game")
		playerID := r.FormValue("playerID")
		// Dispatch event to all others gamer
		if err := dispatchEventToPlayers(gameID,playerID,data) ; err != nil {
			http.Error(w,err.Error(),404)
		}
	}else{
		http.Error(w,"Unknown event",404)
	}
}

func dispatchEventToPlayers(gameID,playerID string, event []byte)error{
	if game,exist := games[gameID] ; exist {
		for player,chanel := range game.Players {
			if !strings.EqualFold(playerID,player){
				chanel <- event
			}
		}
		return nil
	}
	return errors.New("Game with id " + gameID + " not exist")
}

func connectGame(w http.ResponseWriter, r * http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	gameID := r.FormValue("game")
	uniquePlayer := r.FormValue("player")
	if game,exist := games[gameID] ; exist {
		game.counterID++
		playerID := fmt.Sprintf("player_%d", game.counterID)
		game.Players[playerID] = make(chan []byte, 10)
		if strings.EqualFold("",uniquePlayer) {
			writeEvent(w, "welcome", []byte("{\"message\":\"Start game\",\"playerID\":\""+playerID+"\"}"))
		}else{
			writeEvent(w, "welcome", []byte(fmt.Sprintf("{\"message\":\"Rejoin\",\"playerID\":\"%s\",\"uniquePlayerID\":\"%s\"}",playerID,uniquePlayer)))
		}
		go func() {
			<-r.Context().Done()
			close(game.Players[playerID])
			game.Players[playerID] = nil
			delete(game.Players,playerID)
			// If all players are disconnected, remove game
			if len(game.Players) == 0 {
				log.Println("Remove game",gameID)
				delete(games,gameID)
			}else{
				// notify players for disconnect
				dispatchEventToPlayers(gameID,"",[]byte("{\"kind\":\"exit\",\"player\":\"" + playerID + "\"}"))
			}
		}()
		for {
			if event, more := <-game.Players[playerID]; more {
				writeEvent(w, "event", event)
			} else {
				// Close the chanel
				log.Println("Close the chanel")
				break
			}
		}
	}else{
		http.Error(w,"No game exist",404)
	}
}

func writeEvent(w http.ResponseWriter,eventName string, event []byte){
	log.Println(fmt.Sprintf("Send %s : %s",eventName,string(event)))
	w.Write([]byte(fmt.Sprintf("event: %s\n",eventName)))
	w.Write([]byte("data: " + string(event) + "\n\n"))
	w.(http.Flusher).Flush()

}

var games = make(map[string]*Game,0)
var counterGame = 0

// Game represent a monopoly game
type Game struct{
	ID string
	// For each player, a chanel to send information. Key a map is player id
	Players map[string]chan []byte
	counterID int
}
