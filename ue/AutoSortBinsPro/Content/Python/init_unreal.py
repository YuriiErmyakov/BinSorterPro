# BinSorter Pro - started automatically by the Python Editor Script Plugin when the editor opens.
import unreal

try:
    import asb_ue
    asb_ue.start()
except Exception:
    import traceback
    unreal.log_error("[BinSorter Pro] backend failed to start:\n" + traceback.format_exc())
