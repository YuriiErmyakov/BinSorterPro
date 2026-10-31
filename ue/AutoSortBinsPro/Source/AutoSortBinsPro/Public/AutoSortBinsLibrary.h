// BinSorter Pro - what the Python backend needs from C++ (unreal.AutoSortBinsLibrary.*).
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AutoSortBinsLibrary.generated.h"

UCLASS()
class AUTOSORTBINSPRO_API UAutoSortBinsLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Address of the panel UI served by the Python backend (Content/Python/asb_ue.py). Reloads an open panel. */
	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static void SetPanelUrl(const FString& Url);

	UFUNCTION(BlueprintPure, Category = "BinSorter Pro")
	static FString GetPanelUrl();

	/** Opens (or focuses) the BinSorter Pro tab. */
	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static void OpenPanel();

	/** Reloads the page in an open panel. */
	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static void ReloadPanel();

	/** Content Browser folder colour, e.g. "/Game/Meshes". */
	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static void SetFolderColor(const FString& FolderPath, FLinearColor Color);

	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static void ClearFolderColor(const FString& FolderPath);

	UFUNCTION(BlueprintPure, Category = "BinSorter Pro")
	static bool HasFolderColor(const FString& FolderPath);

	/** Points everything that still references the redirectors in these folders at the real assets, then deletes
	 *  the redirectors. Returns how many redirectors were found. */
	UFUNCTION(BlueprintCallable, Category = "BinSorter Pro")
	static int32 FixUpRedirectors(const TArray<FString>& FolderPaths);
};
