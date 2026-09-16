// this is to run geoquerry backend in it we have the main function for sroting the port
// is also handles graceful shutdown and if it fails there is systems set in place 
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"

	"gitlab.com/austin4403/geoquerry/backend/internal/sync"
)

func main() {
	//port where i currently inject my Port in prod
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"  //Not hardcoded directy so that server doesnt fail suddenly in production if port in in use or requested. #stackoverflow
	}

	// routing
	mux := http.NewServeMux()
	path, handler := geoquerryv1connect.NewGeoquerrySyncServiceHandler(&sync.Service{})
	mux.Handle(path, handler)

	//Health chack for uptime monitors and Koyeb
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Server with timeouts -- this is to handle the users with slow connections
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Now we gracefully close the server sith a sigint or keyeb to stop the container
	// (SIGTERM) cancels the context: that means all inflight request will instantly finish and new ones will stop
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	case <-ctx.Done():
		log.Println("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)
		}

	}

}
