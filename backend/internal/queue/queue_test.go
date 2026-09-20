package queue

import (
	"testing"
)

func TestQueueJobKinds(t *testing.T) {
	recon := PaymentReconciliationArgs{}
	if recon.Kind() != "payment_reconciliation" {
		t.Errorf("expected payment_reconciliation kind, got %s", recon.Kind())
	}

	gis := GisIngestionArgs{}
	if gis.Kind() != "gis_ingestion" {
		t.Errorf("expected gis_ingestion kind, got %s", gis.Kind())
	}
}
